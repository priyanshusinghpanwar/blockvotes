import { useEffect, useState } from "react"
import { useRoute, Link } from "wouter"
import { useGetElection, useListCandidates, useListVoters } from "@workspace/api-client-react"
import { Card } from "@/components/ui/card"
import { PageTransition } from "@/components/layout"
import { apiFetch } from "@/lib/api"
import { Trophy, ArrowLeft, Activity, Link as LinkIcon } from "lucide-react"
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts'
import { motion } from "framer-motion"

type AnchorBatch = {
  batchIndex?: number
  batch_index?: number
  merkleRoot?: string
  merkle_root?: string
  txHash?: string
  tx_hash?: string
  blockNumber?: number | null
  block_number?: number | null
}

function normalizeGender(value: unknown): "male" | "female" | "other" {
  if (typeof value !== "string") return "other"
  const normalized = value.trim().toLowerCase()
  if (normalized === "male" || normalized === "m") return "male"
  if (normalized === "female" || normalized === "f") return "female"
  return "other"
}

function getParticipationPercent(participated: number, registered: number): number {
  if (registered <= 0) return 0
  return Math.round((participated / registered) * 10000) / 100
}

function buildParticipationPieData(registered: number, participated: number) {
  const safeRegistered = Math.max(registered, 0)
  const safeParticipated = Math.max(Math.min(participated, safeRegistered), 0)
  return [
    { name: "Participated", value: safeParticipated, fill: "hsl(199 89% 48%)" },
    { name: "Not Participated", value: safeRegistered - safeParticipated, fill: "hsl(215 16% 82%)" },
  ]
}

export default function Results() {
  const [, params] = useRoute("/results/:electionId")
  const id = params?.electionId || ""
  const [anchorBatches, setAnchorBatches] = useState<AnchorBatch[]>([])

  const { data: electionRes, isLoading: loadingE } = useGetElection(id, { query: { queryKey: [`/api/elections/${id}`], enabled: !!id } })
  const { data: candidatesRes, isLoading: loadingC } = useListCandidates(
    { election_id: id }, 
    { query: { queryKey: ["/api/candidates", { election_id: id }], enabled: !!id, refetchInterval: 5000 } } // auto-refresh results every 5s
  )
  const { data: votersRes, isLoading: loadingV } = useListVoters(
    { election_id: id },
    { query: { queryKey: ["/api/voters", { election_id: id }], enabled: !!id, refetchInterval: 5000 } }
  )

  const election = electionRes?.data
  const candidates = candidatesRes?.data || []
  const voters = (votersRes?.data || []) as any[]

  useEffect(() => {
    if (!id) return

    const controller = new AbortController()
    apiFetch(`/api/blockchain/elections/${encodeURIComponent(id)}/anchors`, {
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : null)
      .then(result => {
        const anchors = result?.data?.anchors
        setAnchorBatches(Array.isArray(anchors) ? anchors : [])
      })
      .catch(() => setAnchorBatches([]))

    return () => controller.abort()
  }, [id])

  if (loadingE || loadingC || loadingV) {
    return <div className="min-h-screen flex items-center justify-center p-20">Loading official ledger...</div>
  }
  if (!election) {
    return <div className="min-h-screen flex items-center justify-center">Election not found.</div>
  }

  // Calculate winner and chart data
  const sortedCandidates = [...candidates].sort((a, b) => b.votes - a.votes)
  const highestVotes = sortedCandidates.length > 0 ? sortedCandidates[0].votes : 0
  const isEnded = election.status === 'ended'
  
  // Chart colors
  const COLORS = ['hsl(199 89% 48%)', 'hsl(222 47% 30%)', 'hsl(215 16% 60%)', 'hsl(0 0% 80%)']

  const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0)

  // Participation analytics
  const totalRegistered = voters.length
  const totalParticipated = voters.filter(v => Boolean(v.has_voted)).length
  const totalParticipationPct = getParticipationPercent(totalParticipated, totalRegistered)

  const maleVoters = voters.filter(v => normalizeGender(v.gender) === "male")
  const maleRegistered = maleVoters.length
  const maleParticipated = maleVoters.filter(v => Boolean(v.has_voted)).length
  const maleParticipationPct = getParticipationPercent(maleParticipated, maleRegistered)

  const femaleVoters = voters.filter(v => normalizeGender(v.gender) === "female")
  const femaleRegistered = femaleVoters.length
  const femaleParticipated = femaleVoters.filter(v => Boolean(v.has_voted)).length
  const femaleParticipationPct = getParticipationPercent(femaleParticipated, femaleRegistered)

  const overallPieData = buildParticipationPieData(totalRegistered, totalParticipated)
  const malePieData = buildParticipationPieData(maleRegistered, maleParticipated)
  const femalePieData = buildParticipationPieData(femaleRegistered, femaleParticipated)

  return (
    <PageTransition className="min-h-screen bg-background py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <Link href="/" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft size={16} className="mr-2" /> Home
        </Link>
        
        <div className="text-center mb-12">
          {isEnded ? (
            <div className="inline-flex items-center justify-center p-3 bg-amber-100 text-amber-700 rounded-2xl mb-6 shadow-sm border border-amber-200">
              <Trophy size={32} />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 text-primary rounded-2xl mb-6 border border-primary/20">
              <Activity size={32} className="animate-pulse" />
            </div>
          )}
          
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">{election.name}</h1>
          <p className="text-xl text-muted-foreground">
            {isEnded ? "Official Verified Results" : "Live Preliminary Results"}
          </p>
        </div>

        {/* Winner Highlight (if ended) */}
        {isEnded && sortedCandidates.length > 0 && highestVotes > 0 && (
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-12"
          >
            <Card className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground border-none shadow-2xl p-8 md:p-12 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-10 -mr-10 text-white/5">
                <Trophy size={200} />
              </div>
              <p className="text-primary-foreground/80 font-bold tracking-widest uppercase mb-2 text-sm">Elected Winner</p>
              <h2 className="text-5xl font-display font-bold mb-4 relative z-10">{sortedCandidates[0].name}</h2>
              <p className="text-xl opacity-90 relative z-10">{(sortedCandidates[0] as any).description || ""}{(sortedCandidates[0] as any).description ? " • " : ""}{sortedCandidates[0].votes} Verified Votes</p>
            </Card>
          </motion.div>
        )}

        {/* Participation Analytics */}
        <div className="grid lg:grid-cols-3 gap-6 mb-10">
          <Card className="p-6">
            <h3 className="text-lg font-bold font-display mb-4">Overall Participation</h3>
            <div className="space-y-2 text-sm mb-5">
              <p className="flex justify-between"><span className="text-muted-foreground">Registered Voters</span><strong>{totalRegistered}</strong></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Participated</span><strong>{totalParticipated}</strong></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Vote Participation</span><strong>{totalParticipationPct}%</strong></p>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={overallPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={76} label />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold font-display mb-4">Male Participation</h3>
            <div className="space-y-2 text-sm mb-5">
              <p className="flex justify-between"><span className="text-muted-foreground">Registered Male Voters</span><strong>{maleRegistered}</strong></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Participated Male Voters</span><strong>{maleParticipated}</strong></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Vote Participation</span><strong>{maleParticipationPct}%</strong></p>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={malePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={76} label />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold font-display mb-4">Female Participation</h3>
            <div className="space-y-2 text-sm mb-5">
              <p className="flex justify-between"><span className="text-muted-foreground">Registered Female Voters</span><strong>{femaleRegistered}</strong></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Participated Female Voters</span><strong>{femaleParticipated}</strong></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Vote Participation</span><strong>{femaleParticipationPct}%</strong></p>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={femalePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={76} label />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Charts & Stats */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          <Card className="lg:col-span-2 p-6 md:p-8">
            <h3 className="text-2xl font-bold font-display mb-8">Vote Distribution</h3>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedCandidates} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                  <Tooltip 
                    cursor={{fill: '#F1F5F9'}} 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="votes" radius={[6, 6, 0, 0]}>
                    {sortedCandidates.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold font-display border-b border-border pb-4 mb-4">Summary</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Cast</span>
                  <span className="font-bold text-xl">{totalVotes}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`font-bold capitalize ${isEnded ? 'text-green-600' : 'text-primary'}`}>{election.status}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Candidates</span>
                  <span className="font-bold">{candidates.length}</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-slate-50">
              <h3 className="text-lg font-bold font-display mb-2 flex items-center gap-2">
                <LinkIcon size={18} className="text-muted-foreground"/> Blockchain Integrity
              </h3>
              <p className="text-sm text-muted-foreground mb-4">On-chain proof batches recorded for this election.</p>
              
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {anchorBatches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No on-chain proof batches available yet.</p>
                ) : anchorBatches.map((batch, i) => {
                  const batchIndex = batch.batchIndex ?? batch.batch_index ?? i + 1
                  const txHash = batch.txHash ?? batch.tx_hash ?? ""
                  const merkleRoot = batch.merkleRoot ?? batch.merkle_root ?? ""
                  const blockNumber = batch.blockNumber ?? batch.block_number ?? null
                  return (
                  <div key={`${batchIndex}-${txHash || i}`} className="text-xs font-mono bg-white p-2 rounded border border-border shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-8 text-slate-400">B{batchIndex}</span>
                      <span className="text-slate-700 truncate">{txHash || "Pending tx hash"}</span>
                    </div>
                    <div className="mt-1 text-slate-500 truncate">root {merkleRoot || "unavailable"}</div>
                    {blockNumber ? <div className="mt-1 text-slate-500">block {blockNumber}</div> : null}
                  </div>
                  )
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
