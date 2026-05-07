import { useState } from "react"
import { Link, useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { useGetElection } from "@workspace/api-client-react"
import { PageTransition } from "@/components/layout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"
import { ArrowLeft, KeyRound } from "lucide-react"

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
  const [isSaving, setIsSaving] = useState(false)

  const { data: electionRes } = useGetElection(voter?.election_id || "", {
    query: {
      enabled: !!voter?.election_id,
      queryKey: [`/api/elections/${voter?.election_id || ""}`],
      refetchInterval: 5000,
    },
  })

  if (!voter?.id || !voter?.election_id) {
    setLocation("/voter/login")
    return null
  }

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
    <PageTransition className="min-h-[calc(100vh-5rem)] bg-background py-10">
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
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                disabled={!isPending}
                className="w-full rounded-xl border border-input px-4 py-2.5"
                placeholder="Enter current password"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                disabled={!isPending}
                className="w-full rounded-xl border border-input px-4 py-2.5"
                placeholder="Enter new password"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                disabled={!isPending}
                className="w-full rounded-xl border border-input px-4 py-2.5"
                placeholder="Confirm new password"
                required
              />
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
