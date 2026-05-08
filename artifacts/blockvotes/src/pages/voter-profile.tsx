import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { useGetElection } from "@workspace/api-client-react"
import { PageTransition } from "@/components/layout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"
import { AlertCircle, CheckCircle2, Upload } from "lucide-react"

type VoterProfileResponse = {
  status: string
  message: string
  data?: {
    id: string
    election_id: string
    election_status: "pending" | "active" | "ended"
    voter_id?: string | null
    email: string
    name: string
    mobile?: string | null
    age?: number | null
    gender?: string | null
    photo_url?: string | null
    signature_url?: string | null
    profile_completed?: boolean
    has_voted?: boolean
  } | null
}

function isValidMobile(value: string): boolean {
  const digits = value.replace(/\D/g, "")
  return digits.length >= 10 && digits.length <= 15
}

function isDataImage(value: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value)
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Unable to read file"))
    reader.readAsDataURL(file)
  })
}

export default function VoterProfile() {
  const { voter, setVoter } = useAuth()
  const [, setLocation] = useLocation()
  const { toast } = useToast()

  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [profileCompleted, setProfileCompleted] = useState(false)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [voterId, setVoterId] = useState("")
  const [mobile, setMobile] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("male")
  const [photoUrl, setPhotoUrl] = useState("")
  const [signatureUrl, setSignatureUrl] = useState("")

  const { data: electionRes } = useGetElection(voter?.election_id || "", {
    query: {
      enabled: !!voter?.election_id,
      queryKey: [`/api/elections/${voter?.election_id || ""}`],
      refetchInterval: 5000,
    },
  })

  const election = electionRes?.data
  const isPending = election?.status === "pending"

  useEffect(() => {
    if (!voter?.id || !voter?.election_id) {
      setLocation("/voter/login")
      return
    }

    const run = async () => {
      setIsLoadingProfile(true)
      try {
        const response = await apiFetch("/api/voters/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voter_id: voter.id,
            election_id: voter.election_id,
          }),
        })
        const result = (await response.json()) as VoterProfileResponse
        if (result.status !== "success" || !result.data) {
          toast({
            variant: "destructive",
            title: "Profile not found",
            description: result.message || "Unable to load voter profile.",
          })
          setLocation("/voter/login")
          return
        }

        setName(result.data.name || "")
        setEmail(result.data.email || "")
        setVoterId(result.data.voter_id || "")
        setMobile(result.data.mobile || "")
        setAge(result.data.age ? String(result.data.age) : "")
        setGender((result.data.gender || "male").toLowerCase())
        setPhotoUrl(result.data.photo_url || "")
        setSignatureUrl(result.data.signature_url || "")
        setProfileCompleted(Boolean(result.data.profile_completed))
      } catch (err: any) {
        toast({
          variant: "destructive",
          title: "Profile load failed",
          description: err?.message || "Unable to load voter profile.",
        })
      } finally {
        setIsLoadingProfile(false)
      }
    }

    run()
  }, [setLocation, toast, voter?.election_id, voter?.id])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!voter?.id || !voter?.election_id) return

    if (!isPending) {
      toast({
        variant: "destructive",
        title: "Profile editing locked",
        description: "Profile can be updated only before election starts.",
      })
      return
    }

    if (!name.trim() || !mobile.trim() || !age.trim() || !gender.trim()) {
      toast({
        variant: "destructive",
        title: "Missing details",
        description: "Name, mobile, age, and gender are required.",
      })
      return
    }

    const parsedAge = Number.parseInt(age, 10)
    if (Number.isNaN(parsedAge) || parsedAge <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid age",
        description: "Age must be a positive number.",
      })
      return
    }

    if (!isValidMobile(mobile)) {
      toast({
        variant: "destructive",
        title: "Invalid mobile",
        description: "Use a valid mobile number with 10 to 15 digits.",
      })
      return
    }

    if (!photoUrl.trim() || !signatureUrl.trim()) {
      toast({
        variant: "destructive",
        title: "Photo and signature required",
        description: "Upload both voter photo and signature.",
      })
      return
    }

    if (!isDataImage(photoUrl.trim()) || !isDataImage(signatureUrl.trim())) {
      toast({
        variant: "destructive",
        title: "Upload images",
        description: "Please upload image files directly from your device.",
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await apiFetch("/api/voters/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter_id: voter.id,
          election_id: voter.election_id,
          name: name.trim(),
          mobile: mobile.trim(),
          age: parsedAge,
          gender: gender.trim().toLowerCase(),
          photo_url: photoUrl.trim(),
          signature_url: signatureUrl.trim(),
        }),
      })

      const result = (await response.json()) as VoterProfileResponse
      if (result.status !== "success" || !result.data) {
        toast({
          variant: "destructive",
          title: "Profile save failed",
          description: result.message || "Unable to save profile.",
        })
        return
      }

      setProfileCompleted(true)
      setVoter({
        ...voter,
        name: result.data.name,
        profile_completed: true,
        mobile: result.data.mobile || null,
        voter_id: result.data.voter_id || null,
        age: result.data.age ?? null,
        gender: result.data.gender || null,
        photo_url: result.data.photo_url || null,
        signature_url: result.data.signature_url || null,
      })
      toast({
        title: "Profile completed",
        description: "Your voter profile is verified. You can cast vote once election is active.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Profile save failed",
        description: err?.message || "Unable to save profile.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleContinue = () => {
    if (!voter?.election_id) return
    if (voter.has_voted) {
      setLocation(`/results/${voter.election_id}`)
      return
    }
    if (election?.status === "active") {
      setLocation("/vote")
      return
    }
    if (election?.status === "ended") {
      setLocation(`/results/${voter.election_id}`)
      return
    }
    toast({
      title: "Profile saved",
      description: "Election has not started yet. Please wait for admin to start it.",
    })
  }

  const handlePhotoUpload = async (file: File | null) => {
    if (!file) return
    const value = await readFileAsDataUrl(file)
    setPhotoUrl(value)
  }

  const handleSignatureUpload = async (file: File | null) => {
    if (!file) return
    const value = await readFileAsDataUrl(file)
    setSignatureUrl(value)
  }

  if (!voter) return null

  return (
    <PageTransition className="min-h-[calc(100vh-4rem)] app-section py-10">
      <div className="max-w-3xl mx-auto px-4">
        <Card className="p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold font-display">Complete Voter Profile</h1>
            <p className="text-muted-foreground mt-2">
              Upload photo and signature, verify your details, and complete profile before election starts.
            </p>
          </div>

          {isLoadingProfile ? (
            <p className="text-muted-foreground">Loading profile...</p>
          ) : (
            <>
              {!isPending && !profileCompleted && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    Profile is incomplete and election has already started/ended. Voting is blocked for this account.
                  </span>
                </div>
              )}

              {profileCompleted && (
                <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700 text-sm flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>Profile verification completed successfully.</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Voter ID</label>
                    <input value={voterId} readOnly className="w-full rounded-lg border border-input px-4 py-2.5 bg-muted text-muted-foreground" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Registered Email</label>
                    <input value={email} readOnly className="w-full rounded-lg border border-input px-4 py-2.5 bg-muted text-muted-foreground" />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Full Name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} disabled={!isPending} className="w-full rounded-lg border border-input bg-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary disabled:bg-muted disabled:text-muted-foreground" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Mobile Number</label>
                    <input value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={!isPending} className="w-full rounded-lg border border-input bg-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary disabled:bg-muted disabled:text-muted-foreground" />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Age</label>
                    <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} disabled={!isPending} className="w-full rounded-lg border border-input bg-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary disabled:bg-muted disabled:text-muted-foreground" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Gender</label>
                    <select value={gender} onChange={(e) => setGender(e.target.value)} disabled={!isPending} className="w-full rounded-lg border border-input px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary disabled:bg-muted disabled:text-muted-foreground">
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Voter Photo</label>
                    <label className="flex items-center justify-center gap-2 w-full rounded-lg border border-dashed border-input px-4 py-2.5 cursor-pointer bg-white hover:bg-muted/40">
                      <Upload size={16} />
                      <span className="text-sm">Upload Photo</span>
                      <input type="file" accept="image/*" className="hidden" disabled={!isPending} onChange={(e) => void handlePhotoUpload(e.target.files?.[0] || null)} />
                    </label>
                    {photoUrl && <img src={photoUrl} alt="Voter" className="mt-2 h-20 w-20 rounded-full border object-cover" />}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Signature</label>
                    <label className="flex items-center justify-center gap-2 w-full rounded-lg border border-dashed border-input px-4 py-2.5 cursor-pointer bg-white hover:bg-muted/40">
                      <Upload size={16} />
                      <span className="text-sm">Upload Signature</span>
                      <input type="file" accept="image/*" className="hidden" disabled={!isPending} onChange={(e) => void handleSignatureUpload(e.target.files?.[0] || null)} />
                    </label>
                    {signatureUrl && <img src={signatureUrl} alt="Signature" className="mt-2 h-20 w-32 rounded-md border bg-white object-contain" />}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <Button type="submit" disabled={!isPending} isLoading={isSaving} className="sm:flex-1">
                    Save & Verify Profile
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!isPending}
                    className="sm:flex-1"
                    onClick={() => setLocation("/voter/password")}
                  >
                    Change Password
                  </Button>
                  <Button type="button" variant="outline" className="sm:flex-1" onClick={handleContinue}>
                    Continue
                  </Button>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>
    </PageTransition>
  )
}
