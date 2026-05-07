import { useState } from "react"
import { Link, useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { useListElections, useCreateElection } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog } from "@/components/ui/dialog"
import { PageTransition } from "@/components/layout"
import { Plus, LayoutDashboard, Calendar, Clock3, ChevronRight, Activity, Users, FileLock2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { useQueryClient } from "@tanstack/react-query"

export default function Dashboard() {
  const { company } = useAuth()
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newElectionName, setNewElectionName] = useState("")
  const [newElectionDesc, setNewElectionDesc] = useState("")
  const [newElectionStartDate, setNewElectionStartDate] = useState("")
  const [newElectionStartTime, setNewElectionStartTime] = useState("")
  const [newElectionEndDate, setNewElectionEndDate] = useState("")
  const [newElectionEndTime, setNewElectionEndTime] = useState("")

  // Protect route
  if (!company) {
    setLocation("/company/login")
    return null
  }

  const { data: electionsResponse, isLoading } = useListElections({ company_id: company.id! }, {
    query: {
      queryKey: ["/api/elections", { company_id: company.id }],
      enabled: !!company.id
    }
  })
  
  const elections = electionsResponse?.data || []

  const createMutation = useCreateElection({
    mutation: {
      onSuccess: (res) => {
        if (res.status === "success") {
          toast({ title: "Election Created", description: "You can now add candidates and voters." })
          setIsCreateOpen(false)
          setNewElectionName("")
          setNewElectionDesc("")
          setNewElectionStartDate("")
          setNewElectionStartTime("")
          setNewElectionEndDate("")
          setNewElectionEndTime("")
          queryClient.invalidateQueries({ queryKey: ["/api/elections"] })
        } else {
          toast({ variant: "destructive", title: "Failed", description: res.message })
        }
      }
    }
  })

  const buildDateTimeLocal = (dateValue: string, timeValue: string): string => {
    if (!dateValue || !timeValue) return ""
    return `${dateValue}T${timeValue}`
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const newElectionStartIst = buildDateTimeLocal(newElectionStartDate, newElectionStartTime)
    const newElectionEndIst = buildDateTimeLocal(newElectionEndDate, newElectionEndTime)

    if (!newElectionName || !newElectionDesc || !newElectionStartIst || !newElectionEndIst) {
      toast({
        variant: "destructive",
        title: "Missing schedule",
        description: "Please select both start and end date/time in IST.",
      })
      return
    }

    const startAt = new Date(newElectionStartIst)
    const endAt = new Date(newElectionEndIst)
    if (!(endAt > startAt)) {
      toast({
        variant: "destructive",
        title: "Invalid schedule",
        description: "Election end time must be after start time.",
      })
      return
    }

    createMutation.mutate({
      data: {
        company_id: company.id!,
        name: newElectionName,
        description: newElectionDesc,
        start_time_ist: newElectionStartIst,
        end_time_ist: newElectionEndIst,
      }
    })
  }

  return (
    <PageTransition className="min-h-[calc(100vh-5rem)] bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <LayoutDashboard size={24} />
              </div>
              <h1 className="text-3xl font-bold font-display">Command Center</h1>
            </div>
            <p className="text-muted-foreground text-lg ml-11">Manage active voting sessions and view results.</p>
          </div>
          
          <Button size="lg" onClick={() => setIsCreateOpen(true)} className="gap-2">
            <Plus size={20} /> New Election
          </Button>
        </div>

        <Dialog 
          isOpen={isCreateOpen} 
          onClose={() => setIsCreateOpen(false)}
          title="Create New Election"
          description="Initialize a new secure voting ledger with automatic start and end schedule (IST)."
        >
          <form onSubmit={handleCreate} className="space-y-5 py-2">
            <Input 
              label="Election Name" 
              placeholder="e.g., Board of Directors 2024" 
              value={newElectionName}
              onChange={e => setNewElectionName(e.target.value)}
              required
            />
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground/80 ml-1">Description</label>
              <textarea 
                className="flex w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-base font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 min-h-[100px] resize-none"
                placeholder="Details about this election..."
                value={newElectionDesc}
                onChange={e => setNewElectionDesc(e.target.value)}
                required
              />
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4 bg-muted/20">
                <p className="text-sm font-semibold text-foreground mb-3">1. Start Time (IST)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground/80 ml-1">Date</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="date"
                        value={newElectionStartDate}
                        onChange={e => setNewElectionStartDate(e.target.value)}
                        required
                        className="flex h-12 w-full rounded-xl border-2 border-input bg-card pl-10 pr-3 text-base font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground/80 ml-1">Time</label>
                    <div className="relative">
                      <Clock3 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="time"
                        value={newElectionStartTime}
                        onChange={e => setNewElectionStartTime(e.target.value)}
                        required
                        className="flex h-12 w-full rounded-xl border-2 border-input bg-card pl-10 pr-3 text-base font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border p-4 bg-muted/20">
                <p className="text-sm font-semibold text-foreground mb-3">2. End Time (IST)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground/80 ml-1">Date</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="date"
                        value={newElectionEndDate}
                        onChange={e => setNewElectionEndDate(e.target.value)}
                        required
                        className="flex h-12 w-full rounded-xl border-2 border-input bg-card pl-10 pr-3 text-base font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground/80 ml-1">Time</label>
                    <div className="relative">
                      <Clock3 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="time"
                        value={newElectionEndTime}
                        onChange={e => setNewElectionEndTime(e.target.value)}
                        required
                        className="flex h-12 w-full rounded-xl border-2 border-input bg-card pl-10 pr-3 text-base font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit" isLoading={createMutation.isPending}>Initialize Ledger</Button>
            </div>
          </form>
        </Dialog>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="h-64 animate-pulse bg-muted/50 border-none" />
            ))}
          </div>
        ) : elections.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-border p-12 text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
              <FileLock2 size={32} className="text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold font-display mb-2">No Active Elections</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Your organizational ledger is empty. Create your first election to start registering candidates and voters.
            </p>
            <Button size="lg" onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus size={20} /> Initialize First Election
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {elections.map((election) => {
              const statusColors = {
                pending: "bg-slate-100 text-slate-700 border-slate-200",
                active: "bg-primary/10 text-primary border-primary/20",
                ended: "bg-green-100 text-green-800 border-green-200",
              }
              
              return (
                <Link key={election.id} href={`/election/${election.id}`}>
                  <Card className="h-full hover:shadow-xl hover:border-primary/40 cursor-pointer group flex flex-col">
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start mb-4">
                        <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${statusColors[election.status]}`}>
                          {election.status}
                        </span>
                        <div className="bg-muted p-2 rounded-full group-hover:bg-primary group-hover:text-white transition-colors">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                      <CardTitle className="text-xl line-clamp-1">{election.name}</CardTitle>
                      <CardDescription className="line-clamp-2 mt-2 leading-relaxed h-10">
                        {election.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto pt-4 border-t border-border/50">
                      <div className="flex items-center text-sm text-muted-foreground font-medium">
                        <Calendar size={14} className="mr-2 opacity-70" />
                        Created {format(new Date(election.created_at || new Date()), 'MMM d, yyyy')}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
