import { useState } from "react"
import { useRoute, useLocation, Link } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { 
  useGetElection, useEndElection, 
  useListCandidates, useAddCandidate, useDeleteCandidate,
  useListVoters, useDeleteVoter 
} from "@workspace/api-client-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog } from "@/components/ui/dialog"
import { PageTransition } from "@/components/layout"
import { useToast } from "@/hooks/use-toast"
import { 
  ArrowLeft, Users, UserSquare2, Square, Trophy, 
  Trash2, Plus, AlertCircle, Copy, CheckCheck, Activity, BarChart3, Percent
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type ImportVotersApiResponse = {
  status: string
  message: string
  data?: {
    total?: number
    added?: number
    failed?: number
    results?: Array<{
      row: number
      status: "success" | "error"
      name: string
      email_id: string
      message: string
    }>
  }
}

type ImportPreviewApiResponse = {
  status: string
  message: string
  data?: {
    total?: number
    valid?: number
    invalid?: number
    results?: Array<{
      row: number
      status: "valid" | "error"
      name: string
      email_id: string
      message: string
    }>
  }
}

type HourlyTrendApiResponse = {
  status: string
  message: string
  data?: {
    timeframe?: "10m" | "30m" | "1h" | "3h"
    bucket_minutes?: number
    timezone?: string
    refresh_interval?: string
    generated_at?: string
    points?: Array<{
      bucket_start_utc: string
      bucket_start_ist: string
      elapsed_label: string
      votes_in_bucket: number
      cumulative_votes: number
    }>
  } | null
}

const timeframeOptions = [
  { value: "10m", label: "10 min" },
  { value: "30m", label: "30 min" },
  { value: "1h", label: "1 hour" },
  { value: "3h", label: "3 hours" },
] as const

type ElectionDetailTab = "overview" | "analytics" | "candidates" | "voters"

const analyticsColors = ["#0EA5E9", "#14B8A6", "#F59E0B", "#6366F1", "#22C55E", "#EF4444"]

function buildFileKey(file: File | null): string {
  if (!file) return ""
  return `${file.name}:${file.size}:${file.lastModified}`
}

function downloadCsvReport(fileName: string, rows: Array<Record<string, string | number>>) {
  const headers = ["row", "status", "name", "email_id", "message"]
  const csvLines = [
    headers.join(","),
    ...rows.map(row =>
      headers
        .map(header => {
          const value = String(row[header] ?? "")
          const escaped = value.replace(/"/g, "\"\"")
          return `"${escaped}"`
        })
        .join(","),
    ),
  ]

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.href = url
  link.setAttribute("download", fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function formatElapsedMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

function sanitizeImageSource(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("data:image/")) return trimmed
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed
    }
  } catch {
    return null
  }
  return null
}

export default function ElectionDetail() {
  const [, params] = useRoute("/election/:id")
  const id = params?.id || ""
  const { company } = useAuth()
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const [activeTab, setActiveTab] = useState<ElectionDetailTab>("overview")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Modals state
  const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false)
  const [cName, setCName] = useState("")
  const [cDescription, setCDescription] = useState("")
  const [cEmail, setCEmail] = useState("")
  const [cImageUrl, setCImageUrl] = useState<string | null>(null)
  
  const [isAddVoterOpen, setIsAddVoterOpen] = useState(false)
  const [votersCsvFile, setVotersCsvFile] = useState<File | null>(null)
  const [csvInputKey, setCsvInputKey] = useState(0)
  const [isPreviewingCsv, setIsPreviewingCsv] = useState(false)
  const [isImportingCsv, setIsImportingCsv] = useState(false)
  const [csvPreview, setCsvPreview] = useState<ImportPreviewApiResponse["data"] | null>(null)
  const [csvPreviewFileKey, setCsvPreviewFileKey] = useState("")
  const [selectedTrendTimeframe, setSelectedTrendTimeframe] = useState<"10m" | "30m" | "1h" | "3h">("1h")

  // Queries
  const { data: electionRes, isLoading: loadingE } = useGetElection(id, { query: { queryKey: [`/api/elections/${id}`], enabled: !!id } })
  const { data: candidatesRes } = useListCandidates(
    { election_id: id },
    {
      query: {
        queryKey: ["/api/candidates", { election_id: id }],
        enabled: !!id,
        refetchInterval: activeTab === "analytics" ? 15 * 1000 : false,
        refetchIntervalInBackground: true,
      },
    },
  )
  const { data: votersRes } = useListVoters(
    { election_id: id },
    {
      query: {
        queryKey: ["/api/voters", { election_id: id }],
        enabled: !!id,
        refetchInterval: activeTab === "analytics" ? 15 * 1000 : false,
        refetchIntervalInBackground: true,
      },
    },
  )
  const { data: hourlyTrendRes, isLoading: loadingTrend } = useQuery({
    queryKey: ["/api/elections/hourly-trend", id, selectedTrendTimeframe],
    enabled: !!id && electionRes?.data?.status !== "pending",
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const response = await apiFetch(`/api/elections/${id}/hourly-trend?timeframe=${selectedTrendTimeframe}`)
      return (await response.json()) as HourlyTrendApiResponse
    },
  })

  const election = electionRes?.data
  const candidates = candidatesRes?.data || []
  const voters = votersRes?.data || []
  const registeredVoterCount = voters.length
  const totalVotesCast = voters.filter(voter => voter.has_voted).length
  const pendingVoteCount = Math.max(registeredVoterCount - totalVotesCast, 0)
  const turnoutPercentage = registeredVoterCount > 0
    ? Number(((totalVotesCast / registeredVoterCount) * 100).toFixed(1))
    : 0
  const candidateVoteTotal = candidates.reduce((sum, candidate) => sum + Number((candidate as any).votes ?? 0), 0)
  const candidateChartData = candidates.map((candidate, index) => {
    const votes = Number((candidate as any).votes ?? 0)
    return {
      id: candidate.id,
      name: candidate.name,
      votes,
      percentage: totalVotesCast > 0 ? Number(((votes / totalVotesCast) * 100).toFixed(1)) : 0,
      fill: analyticsColors[index % analyticsColors.length],
    }
  })
  const leadingCandidate = [...candidateChartData].sort((a, b) => b.votes - a.votes)[0]
  const participationData = [
    { name: "Voted", value: totalVotesCast, fill: "#0EA5E9" },
    { name: "Pending", value: pendingVoteCount, fill: "#CBD5E1" },
  ]
  const currentCsvFileKey = buildFileKey(votersCsvFile)
  const isPreviewReadyForCurrentFile = Boolean(
    votersCsvFile && csvPreview && csvPreviewFileKey && csvPreviewFileKey === currentCsvFileKey,
  )
  const trendPoints = hourlyTrendRes?.data?.points || []
  const trendBucketMinutes = hourlyTrendRes?.data?.bucket_minutes
    ?? (selectedTrendTimeframe === "10m" ? 10 : selectedTrendTimeframe === "30m" ? 30 : selectedTrendTimeframe === "3h" ? 180 : 60)
  const trendChartData = trendPoints.map((point, index) => ({
    timeLabel: point.elapsed_label,
    elapsedLabel: formatElapsedMinutes((index + 1) * trendBucketMinutes),
    bucketStartIst: point.bucket_start_ist,
    votesInBucket: point.votes_in_bucket,
    cumulativeVotes: point.cumulative_votes,
  }))
  const trendGeneratedAt = hourlyTrendRes?.data?.generated_at
    ? new Date(hourlyTrendRes.data.generated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : null
  const scheduledStartIst = (election as any)?.scheduled_start_ist as string | null | undefined
  const scheduledEndIst = (election as any)?.scheduled_end_ist as string | null | undefined

  // Mutations
  const endMut = useEndElection()
  const addCandidateMut = useAddCandidate()
  const delCandidateMut = useDeleteCandidate()
  const delVoterMut = useDeleteVoter()

  if (!company) {
    setLocation("/company/login")
    return null
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/elections/${id}`] })
    queryClient.invalidateQueries({ queryKey: ["/api/candidates"] })
    queryClient.invalidateQueries({ queryKey: ["/api/voters"] })
  }

  const handleEnd = () => {
    if (confirm("Are you sure you want to end this election? This cannot be undone.")) {
      endMut.mutate({ electionId: id }, {
        onSuccess: () => {
          toast({ title: "Election Ended", description: "Results are now published." })
          invalidateAll()
        }
      })
    }
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setCImageUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleAddCandidate = (e: React.FormEvent) => {
    e.preventDefault()
    addCandidateMut.mutate({ data: { election_id: id, name: cName, description: cDescription, email: cEmail, image_url: cImageUrl } }, {
      onSuccess: () => {
        setIsAddCandidateOpen(false)
        setCName(""); setCDescription(""); setCEmail(""); setCImageUrl(null)
        toast({ title: "Candidate Added" })
        invalidateAll()
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.message || "Failed to add candidate" })
      }
    })
  }

  const handlePreviewVotersCsv = async () => {
    if (!votersCsvFile) {
      toast({ variant: "destructive", title: "CSV Required", description: "Please choose a CSV file first." })
      return
    }

    setIsPreviewingCsv(true)
    try {
      const csvContent = await votersCsvFile.text()
      const response = await apiFetch("/api/voters/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ election_id: id, csv_content: csvContent }),
      })
      const result = (await response.json()) as ImportPreviewApiResponse

      if (result.status === "success" || result.status === "partial_success" || result.status === "error") {
        setCsvPreview(result.data || null)
        setCsvPreviewFileKey(buildFileKey(votersCsvFile))
        if (result.status === "error") {
          toast({
            variant: "destructive",
            title: "Preview completed with issues",
            description: result.message || "CSV has validation errors.",
          })
          return
        }
        const total = result.data?.total ?? 0
        const valid = result.data?.valid ?? 0
        const invalid = result.data?.invalid ?? 0
        toast({
          title: "CSV Preview Ready",
          description: `Validated ${total} records. ${valid} valid, ${invalid} invalid.`,
        })
        return
      }

      toast({
        variant: "destructive",
        title: "Preview Failed",
        description: result.message || "Unable to preview voters CSV.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Preview Failed",
        description: err?.message || "Unable to preview voters from CSV.",
      })
    } finally {
      setIsPreviewingCsv(false)
    }
  }

  const handleImportVotersCsv = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!votersCsvFile) {
      toast({ variant: "destructive", title: "CSV Required", description: "Please choose a CSV file first." })
      return
    }

    const currentFileKey = buildFileKey(votersCsvFile)
    if (!csvPreview || !csvPreviewFileKey || csvPreviewFileKey !== currentFileKey) {
      toast({
        variant: "destructive",
        title: "Preview Required",
        description: "Please preview this CSV file before importing.",
      })
      return
    }

    if ((csvPreview.valid ?? 0) <= 0) {
      toast({
        variant: "destructive",
        title: "No Valid Rows",
        description: "This CSV has no valid rows to import. Fix validation errors and preview again.",
      })
      return
    }

    setIsImportingCsv(true)
    try {
      const csvContent = await votersCsvFile.text()
      const response = await apiFetch("/api/voters/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ election_id: id, csv_content: csvContent }),
      })
      const result = (await response.json()) as ImportVotersApiResponse

      if (result.status === "success" || result.status === "partial_success") {
        const total = result.data?.total ?? 0
        const added = result.data?.added ?? 0
        const failed = result.data?.failed ?? 0
        toast({
          title: "CSV Import Completed",
          description: `Processed ${total} records. Added ${added}, failed ${failed}.`,
        })
        setVotersCsvFile(null)
        setCsvPreview(null)
        setCsvPreviewFileKey("")
        setCsvInputKey(prev => prev + 1)
        invalidateAll()
        return
      }

      toast({
        variant: "destructive",
        title: "Import Failed",
        description: result.message || "Unable to import voters from CSV.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: err?.message || "Unable to import voters from CSV.",
      })
    } finally {
      setIsImportingCsv(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast({ title: "Copied to clipboard" })
  }

  if (loadingE) return <div className="p-20 text-center text-muted-foreground">Loading...</div>
  if (!election) return <div className="p-20 text-center">Election not found</div>

  const isPending = election.status === 'pending'
  const isActive = election.status === 'active'
  const isEnded = election.status === 'ended'

  return (
    <PageTransition className="min-h-screen app-section pb-20">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur border-b border-border pt-8 pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft size={16} className="mr-2" /> Back to Dashboard
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-3xl md:text-4xl font-bold font-display">{election.name}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  isPending ? 'bg-slate-100 text-slate-700 border-slate-200' : 
                  isActive ? 'bg-primary/10 text-primary border-primary/20' : 
                  'bg-green-100 text-green-800 border-green-200'
                }`}>
                  {election.status}
                </span>
              </div>
              <p className="text-muted-foreground text-lg max-w-2xl">{election.description}</p>
              
              <div className="mt-4 flex items-center gap-2 bg-muted/50 p-2 rounded-lg border border-border inline-flex">
                <span className="text-xs font-mono text-muted-foreground px-2">Election ID:</span>
                <code className="text-sm font-bold bg-white px-2 py-1 rounded border shadow-sm">{election.id}</code>
                <button 
                  onClick={() => copyToClipboard(election.id, 'eid')}
                  className="p-1.5 text-muted-foreground hover:text-primary transition-colors bg-white rounded shadow-sm border"
                >
                  {copiedId === 'eid' ? <CheckCheck size={16} className="text-green-600"/> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              {isActive && (
                <Button size="lg" variant="destructive" onClick={handleEnd} isLoading={endMut.isPending}>
                  <Square size={18} className="mr-2" /> End Election
                </Button>
              )}
              {isEnded && (
                <Link href={`/results/${election.id}`}>
                  <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Trophy size={18} className="mr-2" /> View Official Results
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 sm:gap-8 border-b border-transparent overflow-x-auto">
            {[
              { key: "overview", label: "Overview" },
              { key: "analytics", label: "Analytics" },
              { key: "candidates", label: "Candidates" },
              { key: "voters", label: "Voters" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as ElectionDetailTab)}
                className={`pb-4 text-sm font-bold capitalize tracking-wider transition-colors relative ${
                  activeTab === tab.key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><UserSquare2 size={24}/></div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Candidates</p>
                  <p className="text-3xl font-bold font-display">{candidates.length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-slate-100 text-slate-700 rounded-xl"><Users size={24}/></div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Registered Voters</p>
                  <p className="text-3xl font-bold font-display">{registeredVoterCount}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-green-50 text-green-600 rounded-xl"><CheckCheck size={24}/></div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Votes Cast</p>
                  <p className="text-3xl font-bold font-display">{totalVotesCast}</p>
                </div>
              </div>
            </Card>

            {isPending && (
              <div className="md:col-span-3 bg-blue-50 border border-blue-200 rounded-xl p-6 flex items-start gap-4">
                <AlertCircle className="text-blue-600 shrink-0 mt-1" />
                <div>
                  <h4 className="text-blue-900 font-bold text-lg">Setup Phase</h4>
                  <p className="text-blue-800 mt-1">Add all candidates and voters before scheduled start time. Candidate list will lock automatically when election becomes active.</p>
                </div>
              </div>
            )}

            {isPending && (
              <Card className="md:col-span-3 p-6 border-primary/20 bg-white">
                <h4 className="text-lg font-bold mb-1">Automated Election Timing (IST)</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Start and end times are configured during election creation. This election will run automatically.
                </p>
                <p className="text-sm text-foreground">
                  Start: <strong>{scheduledStartIst || "Not scheduled"}</strong>
                </p>
                <p className="text-sm text-foreground mt-1">
                  End: <strong>{scheduledEndIst || "Not scheduled"}</strong>
                </p>
              </Card>
            )}
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Vote Cast</p>
                    <p className="mt-2 text-3xl font-bold font-display">{totalVotesCast}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 text-blue-600"><Activity size={24} /></div>
                </div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Turnout</p>
                    <p className="mt-2 text-3xl font-bold font-display">{turnoutPercentage}%</p>
                  </div>
                  <div className="p-3 rounded-xl bg-teal-50 text-teal-600"><Percent size={24} /></div>
                </div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Registered Voters</p>
                    <p className="mt-2 text-3xl font-bold font-display">{registeredVoterCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-100 text-slate-700"><Users size={24} /></div>
                </div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Leading Candidate</p>
                    <p className="mt-2 text-xl font-bold font-display truncate max-w-[180px]">
                      {leadingCandidate && leadingCandidate.votes > 0 ? leadingCandidate.name : "No votes yet"}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 text-amber-600"><Trophy size={24} /></div>
                </div>
              </Card>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)] gap-6">
              <Card className="p-6">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-xl font-bold font-display">Candidate Wise Count</h2>
                    <p className="text-sm text-muted-foreground mt-1">Live vote totals for each candidate.</p>
                  </div>
                  <BarChart3 className="text-primary" size={24} />
                </div>

                <div className="h-[320px] w-full">
                  {candidateChartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      No candidates added yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={candidateChartData} margin={{ top: 12, right: 18, left: 0, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "#64748B", fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                        />
                        <YAxis allowDecimals={false} tick={{ fill: "#64748B", fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value) => [Number(value).toLocaleString("en-IN"), "Votes"]} />
                        <Bar dataKey="votes" radius={[8, 8, 0, 0]}>
                          {candidateChartData.map(item => (
                            <Cell key={item.id} fill={item.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Candidate</th>
                        <th className="py-2 px-4">Votes</th>
                        <th className="py-2 pl-4">Vote Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {candidateChartData.length === 0 ? (
                        <tr><td colSpan={3} className="py-4 text-muted-foreground">No candidate data available.</td></tr>
                      ) : candidateChartData.map(item => (
                        <tr key={item.id}>
                          <td className="py-3 pr-4 font-semibold text-foreground">{item.name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{item.votes}</td>
                          <td className="py-3 pl-4 text-muted-foreground">{item.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-bold font-display mb-1">Vote Share</h2>
                <p className="text-sm text-muted-foreground mb-5">Candidate-wise percentage of votes cast.</p>

                <div className="h-[300px] w-full">
                  {candidateVoteTotal === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      No votes recorded yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={candidateChartData.filter(item => item.votes > 0)}
                          dataKey="votes"
                          nameKey="name"
                          innerRadius={62}
                          outerRadius={100}
                          paddingAngle={2}
                        >
                          {candidateChartData.filter(item => item.votes > 0).map(item => (
                            <Cell key={item.id} fill={item.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, _name, item) => {
                          const point = (item as any)?.payload
                          return [`${value} vote(s)`, `${point?.name ?? "Candidate"} (${point?.percentage ?? 0}%)`]
                        }} />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-sm font-semibold text-foreground">Live Election Statistics</p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between gap-4"><span>Status</span><strong className="text-foreground capitalize">{election.status}</strong></div>
                    <div className="flex justify-between gap-4"><span>Candidates</span><strong className="text-foreground">{candidates.length}</strong></div>
                    <div className="flex justify-between gap-4"><span>Votes Pending</span><strong className="text-foreground">{pendingVoteCount}</strong></div>
                    <div className="flex justify-between gap-4"><span>Candidate Vote Total</span><strong className="text-foreground">{candidateVoteTotal}</strong></div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)] gap-6">
              <Card className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl font-bold font-display">Turnout Graph</h2>
                    <p className="text-sm text-muted-foreground mt-1">Cumulative vote activity grouped by timeframe.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {timeframeOptions.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedTrendTimeframe(option.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          selectedTrendTimeframe === option.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-[340px] w-full">
                  {loadingTrend ? (
                    <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                      Loading turnout trend...
                    </div>
                  ) : trendChartData.length === 0 ? (
                    <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                      No turnout data available yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendChartData} margin={{ top: 16, right: 24, left: 8, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis
                          dataKey="elapsedLabel"
                          tick={{ fill: "#64748B", fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                          minTickGap={24}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#64748B", fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          labelFormatter={(value, payload) => {
                            const point = (payload?.[0] as any)?.payload
                            if (point?.bucketStartIst) {
                              return `${String(value)} (${point.bucketStartIst})`
                            }
                            return String(value)
                          }}
                          formatter={(value, name, entry) => {
                            const point = (entry as any)?.payload
                            if (name === "Total voters voted") {
                              return [value, name]
                            }
                            return [point?.votesInBucket ?? value, "Votes in this timeframe"]
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="cumulativeVotes"
                          name="Total voters voted"
                          stroke="#0EA5E9"
                          strokeWidth={3}
                          dot={{ r: 2, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-bold font-display mb-1">Turnout Split</h2>
                <p className="text-sm text-muted-foreground mb-5">Voted vs pending voters.</p>

                <div className="h-[250px] w-full">
                  {registeredVoterCount === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      No voters registered yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={participationData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={58}
                          outerRadius={92}
                          paddingAngle={2}
                        >
                          {participationData.map(item => (
                            <Cell key={item.name} fill={item.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${value} voter(s)`, String(name)]} />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-border pb-3">
                    <span className="text-muted-foreground">Start Time</span>
                    <strong className="text-foreground text-right">{scheduledStartIst || "Not scheduled"}</strong>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-3">
                    <span className="text-muted-foreground">End Time</span>
                    <strong className="text-foreground text-right">{scheduledEndIst || "Not scheduled"}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Last Refresh</span>
                    <strong className="text-foreground text-right">{trendGeneratedAt ? `${trendGeneratedAt} IST` : "Every 15-60 sec"}</strong>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* CANDIDATES TAB */}
        {activeTab === 'candidates' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold font-display">Registered Candidates</h2>
              {isPending && (
                <Button onClick={() => setIsAddCandidateOpen(true)}>
                  <Plus size={18} className="mr-2" /> Add Candidate
                </Button>
              )}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {candidates.length === 0 && <p className="text-muted-foreground col-span-full">No candidates added yet.</p>}
              {candidates.map(c => (
                <Card key={c.id} className="overflow-hidden flex flex-col">
                  {/* Candidate Photo */}
                  <div className="relative h-40 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center overflow-hidden">
                    {(c as any).image_url ? (
                      <img src={(c as any).image_url} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-3xl shadow-lg">
                        {c.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-foreground">{c.name}</h3>
                      {(c as any).email && (
                        <p className="text-xs text-primary font-medium mt-0.5">{(c as any).email}</p>
                      )}
                      {(c as any).description && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">{(c as any).description}</p>
                      )}
                    </div>
                    {isPending && (
                      <div className="mt-4 pt-4 border-t border-border flex justify-end">
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
                          onClick={() => delCandidateMut.mutate({ candidateId: c.id }, { onSuccess: invalidateAll })}
                          isLoading={delCandidateMut.isPending}
                        >
                          <Trash2 size={15} className="mr-1.5"/> Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* VOTERS TAB */}
        {activeTab === 'voters' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold font-display">Voter Registry</h2>
              {isPending && (
                <Button onClick={() => setIsAddVoterOpen(true)}>
                  <Plus size={18} className="mr-2" /> Import Voters CSV
                </Button>
              )}
            </div>

            <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] text-left">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Voter ID</th>
                      <th className="px-6 py-4">Aadhar ID</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Mobile</th>
                      <th className="px-6 py-4">Age</th>
                      <th className="px-6 py-4">Gender</th>
                      <th className="px-6 py-4">Photo</th>
                      <th className="px-6 py-4">Signature</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Registered</th>
                      {isPending && <th className="px-6 py-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {voters.length === 0 && (
                      <tr><td colSpan={isPending ? 12 : 11} className="px-6 py-8 text-center text-muted-foreground">No voters registered.</td></tr>
                    )}
                    {voters.map(v => (
                      <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-semibold text-foreground whitespace-nowrap">{v.name}</td>
                        <td className="px-6 py-4 text-muted-foreground font-mono text-xs whitespace-nowrap">{(v as any).voter_id || "Not provided"}</td>
                        <td className="px-6 py-4 text-muted-foreground font-mono text-xs whitespace-nowrap">{(v as any).aadhar_id || "Not provided"}</td>
                        <td className="px-6 py-4 text-muted-foreground max-w-[240px] break-all">{v.email}</td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{(v as any).mobile || "Not provided"}</td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{(v as any).age ?? "Not provided"}</td>
                        <td className="px-6 py-4 text-muted-foreground capitalize whitespace-nowrap">{(v as any).gender || "Not provided"}</td>
                        <td className="px-6 py-4">
                          {sanitizeImageSource((v as any).photo_url) ? (
                            <img
                              src={(v as any).photo_url}
                              alt={`${v.name} photo`}
                              className="h-10 w-10 rounded-full border border-border object-cover"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Not available</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {sanitizeImageSource((v as any).signature_url) ? (
                            <img
                              src={(v as any).signature_url}
                              alt={`${v.name} signature`}
                              className="h-10 w-24 rounded-md border border-border bg-white object-contain"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Not available</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {v.has_voted ? 
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Voted</span> : 
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">Pending</span>
                          }
                        </td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                          {(v as any).created_at
                            ? new Date((v as any).created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })
                            : "Not available"}
                        </td>
                        {isPending && (
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => delVoterMut.mutate({ voterId: v.id }, { onSuccess: invalidateAll })}
                              className="text-destructive hover:bg-destructive/10 p-2 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <Dialog isOpen={isAddCandidateOpen} onClose={() => setIsAddCandidateOpen(false)} title="Add Candidate">
        <form onSubmit={handleAddCandidate} className="space-y-4">
          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Candidate Photo</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-dashed border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                {cImageUrl ? (
                  <img src={cImageUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-xs text-center px-1">No photo</span>
                )}
              </div>
              <label className="cursor-pointer flex-1">
                <span className="block w-full text-center px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                  Upload Photo
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
          </div>
          <Input label="Full Name" value={cName} onChange={e=>setCName(e.target.value)} required placeholder="e.g. John Smith" />
          <Input label="Email Address" type="email" value={cEmail} onChange={e=>setCEmail(e.target.value)} placeholder="candidate@example.com" />
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">Description / Bio</label>
            <textarea
              value={cDescription}
              onChange={e => setCDescription(e.target.value)}
              placeholder="Brief background, qualifications, or platform..."
              rows={3}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </div>
          <Button type="submit" className="w-full mt-2" isLoading={addCandidateMut.isPending}>Save Candidate</Button>
        </form>
      </Dialog>

      <Dialog isOpen={isAddVoterOpen} onClose={() => setIsAddVoterOpen(false)} title="Import Voters CSV">
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg flex gap-3 items-start">
          <AlertCircle size={16} className="shrink-0 mt-0.5"/>
          <div>
            <p className="font-semibold mb-0.5">Secure password delivery</p>
            <p>
              For every valid CSV row, a unique password is generated and sent with voter credentials.
              Voters sign in using Election ID, registered email, and password.
            </p>
          </div>
        </div>

        <div className="mb-3 p-3 bg-muted/40 border border-border text-sm rounded-lg">
          <p className="font-semibold mb-1">Bulk import from CSV</p>
          <p className="text-muted-foreground">Required headers: <code>name,voter_id,aadhar_id,mobile,email_id,age,gender</code></p>
        </div>

        <form onSubmit={handleImportVotersCsv} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">CSV File</label>
            <input
              key={csvInputKey}
              type="file"
              accept=".csv,text/csv"
              onChange={e => setVotersCsvFile(e.target.files?.[0] || null)}
              className="block w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:font-semibold file:text-primary"
              required
            />
          </div>

          {isPreviewReadyForCurrentFile && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <p className="font-semibold text-foreground">Preview Summary</p>
              <p className="text-muted-foreground mt-1">
                Total: <strong>{csvPreview?.total ?? 0}</strong>, Valid: <strong className="text-green-700">{csvPreview?.valid ?? 0}</strong>, Invalid: <strong className="text-red-700">{csvPreview?.invalid ?? 0}</strong>
              </p>
              {!!csvPreview?.results?.length && (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-primary hover:underline"
                  onClick={() => {
                    downloadCsvReport(
                      `voter-import-preview-${id}.csv`,
                      (csvPreview.results || []).map(row => ({
                        row: row.row,
                        status: row.status,
                        name: row.name,
                        email_id: row.email_id,
                        message: row.message,
                      })),
                    )
                  }}
                >
                  Download Preview Report CSV
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={handlePreviewVotersCsv} isLoading={isPreviewingCsv}>
              Preview CSV
            </Button>
            <Button
              type="submit"
              className="w-full"
              isLoading={isImportingCsv}
              disabled={
                isPreviewingCsv ||
                isImportingCsv ||
                !isPreviewReadyForCurrentFile ||
                (csvPreview?.valid ?? 0) <= 0
              }
            >
              Import CSV & Send Password
            </Button>
          </div>
        </form>
      </Dialog>

    </PageTransition>
  )
}
