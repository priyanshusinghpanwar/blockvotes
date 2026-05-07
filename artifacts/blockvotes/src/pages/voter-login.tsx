import { useEffect, useMemo, useState } from "react"
import { useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Fingerprint, Hash, Mail, ShieldCheck, KeyRound } from "lucide-react"
import { PageTransition } from "@/components/layout"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"

type CredentialInfoResponse = {
  status: string
  message: string
  data?: {
    sent_on_ist?: string | null
    mobile?: string | null
  } | null
}

type LoginInitiateResponse = {
  status: string
  message: string
  data?: {
    challenge_id?: string
    expires_at?: string
    expires_in_seconds?: number
    masked_email?: string
    masked_mobile?: string
    email_sent?: boolean
    sms_sent?: boolean
    delivery_warning?: string | null
    resend_available_at?: string
    resend_available_in_seconds?: number
    retry_after_seconds?: number
    remaining_attempts?: number
    lock_reason?: string
  } | null
}

type LoginVerifyResponse = {
  status: string
  message: string
  data?: {
    id: string
    election_id: string
    name: string
    email: string
    voter_id?: string | null
    mobile?: string | null
    photo_url?: string | null
    signature_url?: string | null
    profile_completed?: boolean
    age?: number | null
    gender?: string | null
    has_voted: boolean
  } | null
}

function formatRemainingTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds)
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export default function VoterLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [electionId, setElectionId] = useState("")
  const [otp, setOtp] = useState("")
  const [passwordSentNote, setPasswordSentNote] = useState<string | null>(null)
  const [step, setStep] = useState<"credentials" | "otp">("credentials")
  const [challengeId, setChallengeId] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [maskedMobile, setMaskedMobile] = useState("")
  const [otpExpiresAtIso, setOtpExpiresAtIso] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [resendAvailableAtIso, setResendAvailableAtIso] = useState<string | null>(null)
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)

  const [location, setLocation] = useLocation()
  const { setVoter } = useAuth()
  const { toast } = useToast()
  const loginMode = useMemo<"vote" | "profile">(() => {
    if (typeof window !== "undefined") {
      const modeFromSearch = new URLSearchParams(window.location.search).get("mode")
      if (modeFromSearch === "profile" || modeFromSearch === "vote") {
        return modeFromSearch
      }
    }
    const query = location.includes("?") ? location.slice(location.indexOf("?")) : ""
    const mode = new URLSearchParams(query).get("mode")
    return mode === "profile" ? "profile" : "vote"
  }, [location])

  const otpExpired = secondsLeft <= 0
  const otpExpiresText = useMemo(() => formatRemainingTime(secondsLeft), [secondsLeft])
  const resendCooldownActive = resendSecondsLeft > 0
  const resendCooldownText = useMemo(() => formatRemainingTime(resendSecondsLeft), [resendSecondsLeft])

  const sendLoginOtp = async () => {
    const trimmedEmail = email.trim()
    const trimmedElectionId = electionId.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedElectionId || !trimmedPassword) {
      toast({
        variant: "destructive",
        title: "Missing details",
        description: "Election ID, email and password are required.",
      })
      return
    }

    setIsSendingOtp(true)
    try {
      const response = await apiFetch("/api/voters/login/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          election_id: trimmedElectionId,
          email: trimmedEmail,
          password: trimmedPassword,
        }),
      })
      const result = (await response.json()) as LoginInitiateResponse
      if (result.status !== "success" || !result.data?.challenge_id || !result.data?.expires_at) {
        if ((result.data?.retry_after_seconds || 0) > 0) {
          const retryAfterSeconds = Number(result.data?.retry_after_seconds || 0)
          const retryAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
          setResendAvailableAtIso(retryAt)
        }
        toast({
          variant: "destructive",
          title: "Login failed",
          description: result.message || "Unable to send OTP. Please try again.",
        })
        return
      }

      setChallengeId(result.data.challenge_id)
      setOtpExpiresAtIso(result.data.expires_at)
      setMaskedEmail(result.data.masked_email || trimmedEmail)
      setMaskedMobile(result.data.masked_mobile || "your mobile")
      setOtp("")
      setStep("otp")
      setResendAvailableAtIso(result.data.resend_available_at || null)
      const sentTo = result.data.email_sent && result.data.sms_sent
        ? "email and mobile"
        : result.data.email_sent
          ? "email"
          : "mobile"
      toast({
        title: "OTP sent",
        description: `A verification OTP was sent to your ${sentTo}.`,
      })
      if (result.data.delivery_warning) {
        toast({
          title: "Delivery warning",
          description: result.data.delivery_warning,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Network error",
        description: err?.message || "Unable to send OTP.",
      })
    } finally {
      setIsSendingOtp(false)
    }
  }

  const verifyOtpAndLogin = async () => {
    const trimmedOtp = otp.trim()
    if (!challengeId || !trimmedOtp) {
      toast({
        variant: "destructive",
        title: "OTP required",
        description: "Please enter the OTP sent to your email and mobile.",
      })
      return
    }

    setIsVerifyingOtp(true)
    try {
      const response = await apiFetch("/api/voters/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: challengeId, otp: trimmedOtp }),
      })
      const result = (await response.json()) as LoginVerifyResponse
      if (result.status !== "success" || !result.data) {
        toast({
          variant: "destructive",
          title: "Verification failed",
          description: result.message || "Invalid OTP",
        })
        return
      }

      setVoter(result.data)
      toast({
        title: "Identity verified",
        description: `Welcome, ${result.data.name}`,
      })

      if (loginMode === "profile") {
        setLocation("/voter/profile")
        return
      }
      setLocation("/vote")
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Network error",
        description: err?.message || "Unable to verify OTP.",
      })
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (step === "credentials") {
      await sendLoginOtp()
      return
    }
    await verifyOtpAndLogin()
  }

  useEffect(() => {
    const trimmedEmail = email.trim()
    const trimmedElectionId = electionId.trim()

    if (!trimmedEmail || !trimmedElectionId || step !== "credentials") {
      setPasswordSentNote(null)
      return
    }

    if (!trimmedEmail.includes("@")) {
      setPasswordSentNote(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch("/api/voters/credential-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ election_id: trimmedElectionId, email: trimmedEmail }),
          signal: controller.signal,
        })

        const result = (await response.json()) as CredentialInfoResponse
        if (result.status === "success" && result.data?.sent_on_ist) {
          setPasswordSentNote(`Password was sent to your mobile number on ${result.data.sent_on_ist}.`)
        } else {
          setPasswordSentNote(null)
        }
      } catch {
        setPasswordSentNote(null)
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [email, electionId, step])

  useEffect(() => {
    if (step !== "otp" || !otpExpiresAtIso) {
      setSecondsLeft(0)
      return
    }

    const expiryMs = new Date(otpExpiresAtIso).getTime()
    if (Number.isNaN(expiryMs)) {
      setSecondsLeft(0)
      return
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((expiryMs - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }

    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [step, otpExpiresAtIso])

  useEffect(() => {
    if (step !== "otp" || !resendAvailableAtIso) {
      setResendSecondsLeft(0)
      return
    }

    const resendAllowedAtMs = new Date(resendAvailableAtIso).getTime()
    if (Number.isNaN(resendAllowedAtMs)) {
      setResendSecondsLeft(0)
      return
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((resendAllowedAtMs - Date.now()) / 1000))
      setResendSecondsLeft(remaining)
    }

    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [step, resendAvailableAtIso])

  return (
    <PageTransition className="min-h-[calc(100vh-5rem)] flex items-center justify-center relative py-12 px-4">
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/blockchain.jpg`}
          alt="Blockchain Network"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"></div>
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-cyan-500/20 blur-3xl"></div>
        <div className="absolute -bottom-28 -left-16 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="mx-auto w-20 h-20 bg-white/10 text-white rounded-full border border-white/20 flex items-center justify-center backdrop-blur-md mb-5 shadow-2xl">
            <Fingerprint size={40} className="text-accent" />
          </div>
          <h1 className="text-3xl font-bold font-display text-white">Voter Access Portal</h1>
          <p className="text-slate-300 mt-2">
            {step === "credentials"
              ? "Secure login using election ID, registered email, and password."
              : "Enter the OTP sent to your registered email and mobile number."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-300">
            <span className={`rounded-full px-3 py-1 border ${step === "credentials" ? "border-accent/60 bg-accent/20 text-cyan-100" : "border-white/15 bg-white/5"}`}>
              1. Identity Check
            </span>
            <span className={`rounded-full px-3 py-1 border ${step === "otp" ? "border-accent/60 bg-accent/20 text-cyan-100" : "border-white/15 bg-white/5"}`}>
              2. OTP Verification
            </span>
          </div>
        </div>

        <Card className="p-8 glass-dark text-white border-white/10 shadow-2xl">
          <div className="mb-5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-100 text-sm flex items-start gap-2">
            <ShieldCheck size={18} className="shrink-0 mt-0.5" />
            <span>Your credentials and vote session are protected with encrypted verification.</span>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            {step === "credentials" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-300 ml-1">Election ID</label>
                  <div className="relative">
                    <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Paste the ID provided by your admin"
                      value={electionId}
                      onChange={e => setElectionId(e.target.value)}
                      required
                      className="flex w-full rounded-xl border border-white/20 bg-white/5 pl-11 pr-4 py-3 text-base text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-300 ml-1">Registered Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      placeholder="voter@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="flex w-full rounded-xl border border-white/20 bg-white/5 pl-11 pr-4 py-3 text-base text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-300 ml-1">Password</label>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      maxLength={12}
                      placeholder="Enter your password (e.g. AB12CD34)"
                      value={password}
                      onChange={e => setPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                      required
                      className="flex w-full rounded-xl border border-white/20 bg-white/5 pl-11 pr-4 py-3 text-base text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all tracking-widest font-mono text-center text-lg"
                    />
                  </div>
                  <p className="text-xs text-slate-400 pl-1">
                    {passwordSentNote || "Password is sent to your mobile number on the date when credentials email is sent."}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-4 bg-accent hover:bg-accent/90 text-accent-foreground font-bold shadow-lg shadow-accent/20"
                  size="lg"
                  isLoading={isSendingOtp}
                >
                  Continue to OTP Verification
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-sm">
                  <p className="text-slate-200 font-medium">OTP sent to</p>
                  <p className="text-slate-300 mt-1">{maskedEmail || email}</p>
                  <p className="text-slate-300">{maskedMobile || "registered mobile"}</p>
                  <p className={`mt-2 font-semibold ${otpExpired ? "text-red-300" : "text-emerald-300"}`}>
                    {otpExpired ? "OTP expired" : `OTP valid for ${otpExpiresText} (max 10 minutes)`}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-300 ml-1">Enter OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                    required
                    className="flex w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all tracking-[0.35em] font-mono text-center text-lg"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full mt-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold shadow-lg shadow-accent/20"
                  size="lg"
                  isLoading={isVerifyingOtp}
                  disabled={otpExpired}
                >
                  Verify OTP & Enter
                </Button>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1 border border-white/25 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => {
                      setStep("credentials")
                      setOtp("")
                      setChallengeId("")
                      setOtpExpiresAtIso(null)
                      setResendAvailableAtIso(null)
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1 border border-white/25 bg-white/10 text-white hover:bg-white/20"
                    onClick={sendLoginOtp}
                    isLoading={isSendingOtp}
                    disabled={isSendingOtp || resendCooldownActive}
                  >
                    {resendCooldownActive ? `Resend OTP (${resendCooldownText})` : "Resend OTP"}
                  </Button>
                </div>
              </>
            )}
          </form>
        </Card>
      </div>
    </PageTransition>
  )
}
