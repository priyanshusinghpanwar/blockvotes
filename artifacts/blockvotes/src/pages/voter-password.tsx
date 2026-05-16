import { useEffect, useState } from "react"
import { Link, useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { useGetElection } from "@workspace/api-client-react"
import { PageTransition } from "@/components/layout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"
import { ArrowLeft, KeyRound, Eye, EyeOff } from "lucide-react"

type ChangePasswordResponse = {
  status: string
  message: string
}

export default function VoterPassword() {
  const { voter } = useAuth()
  const [, setLocation] = useLocation()
  const { toast } = useToast()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const { data: electionRes } = useGetElection(voter?.election_id || "", {
    query: {
      enabled: !!voter?.election_id,
      queryKey: [`/api/elections/${voter?.election_id || ""}`],
      refetchInterval: 5000,
    },
  })

  useEffect(() => {
    if (!voter?.id || !voter?.election_id) setLocation("/voter/login")
  }, [setLocation, voter?.election_id, voter?.id])

  if (!voter?.id || !voter?.election_id) return null

  const isPending = electionRes?.data?.status === "pending"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isPending) {
      toast({
        variant: "destructive",
        title: "Password change locked",
        description: "Password can be changed only before election starts.",
      })
      return
    }

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      toast({
        variant: "destructive",
        title: "Missing details",
        description: "Please fill all password fields.",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Password mismatch",
        description: "New password and confirm password do not match.",
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await apiFetch("/api/voters/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter_id: voter.id,
          election_id: voter.election_id,
          current_password: currentPassword.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
          new_password: newPassword.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
        }),
      })
      const result = (await response.json()) as ChangePasswordResponse

      if (result.status !== "success") {
        toast({
          variant: "destructive",
          title: "Password update failed",
          description: result.message || "Unable to change password.",
        })
        return
      }

      toast({
        title: "Password changed",
        description: "Your password was updated successfully.",
      })
      setLocation("/voter/profile")
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Password update failed",
        description: err?.message || "Unable to change password.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageTransition className="min-h-[calc(100vh-4rem)] app-section py-10">
      <div className="max-w-xl mx-auto px-4">
        <Card className="p-6 md:p-8">
          <Link href="/voter/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground mb-5">
            <ArrowLeft size={16} />
            Back to Voter Profile
          </Link>

          <div className="mb-6">
            <div className="inline-flex items-center justify-center rounded-xl bg-primary/10 text-primary p-2 mb-3">
              <KeyRound size={22} />
            </div>
            <h1 className="text-2xl font-bold font-display">Change Password</h1>
            <p className="text-muted-foreground mt-1">Update your voter account password before election starts.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                  disabled={!isPending}
                  className="w-full rounded-lg border border-input bg-white px-4 pr-12 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(current => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                >
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                  disabled={!isPending}
                  className="w-full rounded-lg border border-input bg-white px-4 pr-12 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  placeholder="Enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(current => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                  disabled={!isPending}
                  className="w-full rounded-lg border border-input bg-white px-4 pr-12 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  placeholder="Confirm new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(current => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!isPending} isLoading={isSaving}>
              Update Password
            </Button>
          </form>
        </Card>
      </div>
    </PageTransition>
  )
}
