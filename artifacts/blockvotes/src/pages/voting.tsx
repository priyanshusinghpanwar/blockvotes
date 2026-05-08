import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { useListCandidates, useGetElection } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageTransition } from "@/components/layout"
import { motion, AnimatePresence } from "framer-motion"
import { Fingerprint, Lock, ShieldCheck, CheckCircle2, BadgeCheck, Sparkles, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"

export default function Voting() {
  const { voter, setVoter } = useAuth()
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [encryptionStage, setEncryptionStage] = useState(0)
  const [mockHash, setMockHash] = useState("")
  const electionId = voter?.election_id || ""

  const { data: electionRes, isLoading: loadingE } = useGetElection(electionId, {
    query: { queryKey: [`/api/elections/${electionId}`], enabled: !!electionId && Boolean(voter?.profile_completed) }
  })
  
  const { data: candidatesRes, isLoading: loadingC } = useListCandidates(
    { election_id: electionId }, 
    { query: { queryKey: ["/api/candidates", { election_id: electionId }], enabled: !!electionId && Boolean(voter?.profile_completed) } }
  )

  const election = electionRes?.data
  const candidates = candidatesRes?.data || []

  useEffect(() => {
    if (!voter) {
      setLocation("/voter/login")
      return
    }

    if (!voter.profile_completed) {
      toast({
        variant: "destructive",
        title: "Complete profile first",
        description: "Upload photo/signature and verify profile before voting.",
      })
      setLocation("/voter/profile")
    }
  }, [setLocation, toast, voter])

  if (!voter || !voter.profile_completed) return null

  if (voter.has_voted) {
    return (
      <PageTransition className="min-h-[calc(100vh-4rem)] app-section py-12 relative overflow-hidden">
        <div className="max-w-3xl mx-auto px-4 relative z-10">
          <Card className="p-8 md:p-12 text-center">
            <div className="inline-flex items-center justify-center p-3 bg-emerald-50 text-emerald-600 rounded-xl mb-6 border border-emerald-200">
              <CheckCircle2 size={34} />
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Your Vote Has Been Recorded</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              Thank you for participating. Your ballot has been securely encrypted and written to the ledger.
              Final results will be visible once the election is officially ended.
            </p>
            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setLocation("/")} className="min-w-52">
                Return to Home
              </Button>
            </div>
          </Card>
        </div>
      </PageTransition>
    )
  }

  const handleVoteSubmit = async () => {
    if (!selectedCandidateId || !voter.id || !voter.election_id) return
    
    setIsSubmitting(true)
    
    setEncryptionStage(1)
    await new Promise(r => setTimeout(r, 1000))
    setEncryptionStage(2)
    
    try {
      const response = await apiFetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: selectedCandidateId }),
      })
      const result = await response.json()
      if (!response.ok || result.status !== "success") {
        throw new Error(result.message || "Failed to cast vote")
      }

      setMockHash(result.data?.block_hash || "")
      setEncryptionStage(3)
      await new Promise(r => setTimeout(r, 500))
      setEncryptionStage(4)
      setVoter({ ...voter, has_voted: true })
      toast({
        title: "Vote submitted",
        description: "Your vote has been successfully recorded.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Vote failed",
        description: err?.message || "Failed to cast vote",
      })
      setIsSubmitting(false)
      setEncryptionStage(0)
    }
  }

  if (loadingE || loadingC) {
    return <div className="min-h-screen flex items-center justify-center text-primary font-bold">Connecting to Ledger...</div>
  }

  if (election?.status === "pending") {
    return (
      <PageTransition className="min-h-[calc(100vh-4rem)] app-section py-12 relative overflow-hidden">
        <div className="max-w-3xl mx-auto px-4 relative z-10">
          <Card className="p-8 md:p-10 text-center">
            <div className="inline-flex items-center justify-center p-3 bg-amber-50 text-amber-600 rounded-xl mb-6 border border-amber-200">
              <AlertCircle size={34} />
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Election Is Not Started Yet</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              Voting will open automatically at the scheduled start time. Please wait and try again once the election becomes active.
            </p>
            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setLocation("/voter/profile")} className="min-w-52">
                Go to Update Profile
              </Button>
            </div>
          </Card>
        </div>
      </PageTransition>
    )
  }

  if (election?.status === "ended") {
    return (
      <PageTransition className="min-h-[calc(100vh-4rem)] app-section py-12 relative overflow-hidden">
        <div className="max-w-3xl mx-auto px-4 relative z-10">
          <Card className="p-8 md:p-10 text-center">
            <div className="inline-flex items-center justify-center p-3 bg-slate-100 text-slate-600 rounded-xl mb-6 border border-slate-200">
              <AlertCircle size={34} />
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Election Has Ended</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              Voting is now closed. Please contact your admin if you expected to vote in this election.
            </p>
            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setLocation("/")} className="min-w-52">
                Return to Home
              </Button>
            </div>
          </Card>
        </div>
      </PageTransition>
    )
  }

  const selectedCandidate = candidates.find(candidate => candidate.id === selectedCandidateId) || null

  return (
    <PageTransition className="min-h-[calc(100vh-4rem)] app-section py-10 md:py-12 relative overflow-hidden">

      <div className="max-w-4xl mx-auto px-4 relative z-10">
        
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-white text-primary rounded-xl mb-4 border border-border shadow-sm">
            <Lock size={32} />
          </div>
          <h1 className="text-3xl md:text-5xl font-display font-bold mb-3">{election?.name}</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Choose your candidate. Your vote is encrypted, signed, and submitted once.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm text-muted-foreground shadow-sm">
            <BadgeCheck size={16} className="text-emerald-600" />
            Logged in as <strong className="text-foreground">{voter.name}</strong>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mb-12">
          {candidates.map(c => {
            const isSelected = selectedCandidateId === c.id
            return (
              <motion.button
                key={c.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedCandidateId(c.id)}
                className={`text-left rounded-xl border transition-all duration-200 relative overflow-hidden shadow-sm ${
                  isSelected 
                    ? 'bg-sky-50 border-accent ring-2 ring-accent/15' 
                    : 'bg-white border-border hover:border-primary/30 hover:bg-slate-50'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-4 right-4 text-accent z-10">
                    <CheckCircle2 size={22} />
                  </div>
                )}
                {/* Candidate Photo */}
                <div className="h-44 w-full bg-slate-100 flex items-center justify-center overflow-hidden">
                  {(c as any).image_url ? (
                    <img src={(c as any).image_url} alt={c.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold ${isSelected ? 'bg-accent text-white' : 'bg-white text-muted-foreground border border-border'}`}>
                      {c.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="text-xl font-bold mb-1">{c.name}</h3>
                  {(c as any).email && (
                    <p className="text-primary text-xs font-medium mb-2">{(c as any).email}</p>
                  )}
                  {(c as any).description && (
                    <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">{(c as any).description}</p>
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>

        <Card className="p-5 md:p-6 mb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current selection</p>
              <p className="text-lg font-semibold text-foreground mt-1">
                {selectedCandidate ? selectedCandidate.name : "No candidate selected"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">This vote is final after submission.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <Sparkles size={16} />
              Blockchain-secured vote record
            </div>
          </div>
        </Card>

        <div className="text-center mt-6">
          <Button 
            size="lg" 
            className={`w-full max-w-md text-base sm:text-lg h-14 rounded-lg font-bold transition-all ${
              selectedCandidateId ? '' : 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
            }`}
            onClick={handleVoteSubmit}
            disabled={!selectedCandidateId || isSubmitting}
          >
            {isSubmitting ? "Processing Secure Vote..." : "Securely Cast Vote"}
          </Button>
        </div>
      </div>

      {/* BLOCKCHAIN SUBMISSION OVERLAY */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="fixed inset-0 z-50 bg-white/95 backdrop-blur-lg flex flex-col items-center justify-center text-foreground"
          >
            <div className="max-w-md w-full px-6 text-center">
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                className="w-24 h-24 border-4 border-slate-200 border-t-accent rounded-full mx-auto mb-8"
              />
              
              <h2 className="text-2xl font-display font-bold mb-6">Securing Transaction</h2>
              
              <div className="space-y-4 text-left bg-white p-6 rounded-xl border border-border shadow-sm font-mono text-sm">
                <div className={`flex items-center gap-3 ${encryptionStage >= 1 ? 'text-green-400' : 'text-slate-500'}`}>
                  {encryptionStage >= 1 ? <ShieldCheck size={18}/> : <div className="w-4 h-4 rounded-full border border-current"/>}
                  <span>Verifying voter identity signature...</span>
                </div>
                
                <div className={`flex items-center gap-3 ${encryptionStage >= 2 ? 'text-primary' : 'text-slate-500'}`}>
                  {encryptionStage >= 2 ? <Lock size={18}/> : <div className="w-4 h-4 rounded-full border border-current"/>}
                  <span>Receiving server vote receipt hash</span>
                </div>
                {encryptionStage >= 2 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pl-7 text-xs text-muted-foreground break-all">
                    {mockHash || "Pending confirmation..."}
                  </motion.div>
                )}

                <div className={`flex items-center gap-3 ${encryptionStage >= 3 ? 'text-primary' : 'text-slate-500'}`}>
                  {encryptionStage >= 3 ? <Fingerprint size={18}/> : <div className="w-4 h-4 rounded-full border border-current"/>}
                  <span>Recording ballot in election database...</span>
                </div>
                
                <div className={`flex items-center gap-3 ${encryptionStage >= 4 ? 'text-foreground font-bold' : 'text-slate-500'}`}>
                  {encryptionStage >= 4 ? <CheckCircle2 size={18} className="text-green-500"/> : <div className="w-4 h-4 rounded-full border border-current"/>}
                  <span>Vote successfully cast</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
