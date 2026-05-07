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

  if (!voter) {
    setLocation("/voter/login")
    return null
  }
  if (!voter.profile_completed) {
    setLocation("/voter/profile")
    return null
  }

  const { data: electionRes, isLoading: loadingE } = useGetElection(voter.election_id!, {
    query: { queryKey: [`/api/elections/${voter.election_id}`], enabled: !!voter.election_id }
  })
  
  const { data: candidatesRes, isLoading: loadingC } = useListCandidates(
    { election_id: voter.election_id! }, 
    { query: { queryKey: ["/api/candidates", { election_id: voter.election_id }], enabled: !!voter.election_id } }
  )

  const election = electionRes?.data
  const candidates = candidatesRes?.data || []

  useEffect(() => {
    if (voter && !voter.profile_completed) {
      toast({
        variant: "destructive",
        title: "Complete profile first",
        description: "Upload photo/signature and verify profile before voting.",
      })
      setLocation("/voter/profile")
    }
  }, [setLocation, toast, voter])

  if (voter.has_voted) {
    return (
      <PageTransition className="min-h-[calc(100vh-5rem)] bg-[#081127] text-white py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(#38BDF8 1px, transparent 1px)", backgroundSize: "42px 42px" }}></div>
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-32 -left-24 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none"></div>
        <div className="max-w-3xl mx-auto px-4 relative z-10">
          <Card className="bg-white/6 border border-white/15 p-8 md:p-12 text-center text-white shadow-2xl">
            <div className="inline-flex items-center justify-center p-3 bg-emerald-500/20 text-emerald-300 rounded-2xl mb-6 border border-emerald-500/30">
              <CheckCircle2 size={34} />
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Your Vote Has Been Recorded</h1>
            <p className="text-slate-300 text-lg max-w-2xl mx-auto leading-relaxed">
              Thank you for participating. Your ballot has been securely encrypted and written to the ledger.
              Final results will be visible once the election is officially ended.
            </p>
            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setLocation("/")} className="bg-accent hover:bg-accent/90 min-w-52">
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
      <PageTransition className="min-h-[calc(100vh-5rem)] bg-[#081127] text-white py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(#38BDF8 1px, transparent 1px)", backgroundSize: "42px 42px" }}></div>
        <div className="max-w-3xl mx-auto px-4 relative z-10">
          <Card className="bg-white/6 border border-white/15 p-8 md:p-10 text-center text-white shadow-2xl">
            <div className="inline-flex items-center justify-center p-3 bg-amber-500/20 text-amber-300 rounded-2xl mb-6 border border-amber-500/30">
              <AlertCircle size={34} />
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Election Is Not Started Yet</h1>
            <p className="text-slate-300 text-lg max-w-2xl mx-auto leading-relaxed">
              Voting will open automatically at the scheduled start time. Please wait and try again once the election becomes active.
            </p>
            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setLocation("/voter/profile")} className="bg-accent hover:bg-accent/90 min-w-52">
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
      <PageTransition className="min-h-[calc(100vh-5rem)] bg-[#081127] text-white py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(#38BDF8 1px, transparent 1px)", backgroundSize: "42px 42px" }}></div>
        <div className="max-w-3xl mx-auto px-4 relative z-10">
          <Card className="bg-white/6 border border-white/15 p-8 md:p-10 text-center text-white shadow-2xl">
            <div className="inline-flex items-center justify-center p-3 bg-slate-500/20 text-slate-200 rounded-2xl mb-6 border border-slate-500/30">
              <AlertCircle size={34} />
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Election Has Ended</h1>
            <p className="text-slate-300 text-lg max-w-2xl mx-auto leading-relaxed">
              Voting is now closed. Please contact your admin if you expected to vote in this election.
            </p>
            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setLocation("/")} className="bg-accent hover:bg-accent/90 min-w-52">
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
    <PageTransition className="min-h-[calc(100vh-5rem)] bg-[#081127] text-white py-12 relative overflow-hidden">
      
      {/* Blockchain background element */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(#38BDF8 1px, transparent 1px)", backgroundSize: "42px 42px" }}></div>
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 -left-24 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none"></div>

      <div className="max-w-4xl mx-auto px-4 relative z-10">
        
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-primary/20 text-accent rounded-2xl mb-4 border border-primary/50">
            <Lock size={32} />
          </div>
          <h1 className="text-3xl md:text-5xl font-display font-bold mb-3">{election?.name}</h1>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto">Choose your candidate. Your vote is encrypted, signed, and submitted once.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300">
            <BadgeCheck size={16} className="text-emerald-300" />
            Logged in as <strong className="text-white">{voter.name}</strong>
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
                className={`text-left rounded-2xl border-2 transition-all duration-300 relative overflow-hidden shadow-xl ${
                  isSelected 
                    ? 'bg-primary/25 border-accent shadow-cyan-400/20' 
                    : 'bg-white/6 border-white/10 hover:border-white/35'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-4 right-4 text-accent z-10 drop-shadow">
                    <CheckCircle2 size={22} />
                  </div>
                )}
                {/* Candidate Photo */}
                <div className="h-44 w-full bg-white/5 flex items-center justify-center overflow-hidden">
                  {(c as any).image_url ? (
                    <img src={(c as any).image_url} alt={c.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold ${isSelected ? 'bg-accent text-white' : 'bg-white/10 text-white/70'}`}>
                      {c.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="text-xl font-bold mb-1">{c.name}</h3>
                  {(c as any).email && (
                    <p className="text-accent text-xs font-medium mb-2">{(c as any).email}</p>
                  )}
                  {(c as any).description && (
                    <p className="text-slate-400 text-sm leading-relaxed line-clamp-2">{(c as any).description}</p>
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>

        <Card className="bg-white/6 border border-white/15 p-5 md:p-6 text-white mb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Current selection</p>
              <p className="text-lg font-semibold text-white mt-1">
                {selectedCandidate ? selectedCandidate.name : "No candidate selected"}
              </p>
              <p className="text-sm text-slate-400 mt-1">This vote is final after submission.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
              <Sparkles size={16} />
              Blockchain-secured vote record
            </div>
          </div>
        </Card>

        <div className="text-center mt-6">
          <Button 
            size="lg" 
            className={`w-full max-w-md text-lg h-16 rounded-2xl font-bold transition-all ${
              selectedCandidateId ? 'bg-accent hover:bg-accent/90 shadow-xl shadow-accent/30' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
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
            className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-lg flex flex-col items-center justify-center text-white"
          >
            <div className="max-w-md w-full px-6 text-center">
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                className="w-24 h-24 border-4 border-slate-700 border-t-accent rounded-full mx-auto mb-8"
              />
              
              <h2 className="text-2xl font-display font-bold mb-6">Securing Transaction</h2>
              
              <div className="space-y-4 text-left bg-black/50 p-6 rounded-xl border border-white/10 font-mono text-sm">
                <div className={`flex items-center gap-3 ${encryptionStage >= 1 ? 'text-green-400' : 'text-slate-500'}`}>
                  {encryptionStage >= 1 ? <ShieldCheck size={18}/> : <div className="w-4 h-4 rounded-full border border-current"/>}
                  <span>Verifying voter identity signature...</span>
                </div>
                
                <div className={`flex items-center gap-3 ${encryptionStage >= 2 ? 'text-accent' : 'text-slate-500'}`}>
                  {encryptionStage >= 2 ? <Lock size={18}/> : <div className="w-4 h-4 rounded-full border border-current"/>}
                  <span>Receiving server vote receipt hash</span>
                </div>
                {encryptionStage >= 2 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pl-7 text-xs text-slate-400 break-all">
                    {mockHash || "Pending confirmation..."}
                  </motion.div>
                )}

                <div className={`flex items-center gap-3 ${encryptionStage >= 3 ? 'text-primary' : 'text-slate-500'}`}>
                  {encryptionStage >= 3 ? <Fingerprint size={18}/> : <div className="w-4 h-4 rounded-full border border-current"/>}
                  <span>Recording ballot in election database...</span>
                </div>
                
                <div className={`flex items-center gap-3 ${encryptionStage >= 4 ? 'text-white font-bold' : 'text-slate-500'}`}>
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
