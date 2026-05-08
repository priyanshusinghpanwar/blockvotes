import { useState } from "react"
import { Link, useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { useLoginCompany } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Shield } from "lucide-react"
import { PageTransition } from "@/components/layout"
import { useToast } from "@/hooks/use-toast"

export default function CompanyLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [, setLocation] = useLocation()
  const { setCompany } = useAuth()
  const { toast } = useToast()

  const loginMutation = useLoginCompany({
    mutation: {
      onSuccess: (data) => {
        if (data.status === "success" && data.data) {
          setCompany(data.data)
          toast({
            title: "Login Successful",
            description: `Welcome back, ${data.data.name}`,
          })
          setLocation("/dashboard")
        } else {
          toast({
            variant: "destructive",
            title: "Login Failed",
            description: data.message || "Invalid credentials",
          })
        }
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: err.message || "Failed to communicate with server",
        })
      }
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    loginMutation.mutate({ data: { email, password } })
  }

  return (
    <PageTransition className="min-h-[calc(100vh-4rem)] flex items-center justify-center relative py-10 px-4 app-section overflow-hidden">
      {/* Background Image - blockchain network */}
      <div className="absolute inset-0 z-0 opacity-40">
        <img 
          src={`${import.meta.env.BASE_URL}images/blockchain.jpg`} 
          alt="Blockchain Network" 
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-white/85 backdrop-blur-[1px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 bg-white text-primary rounded-xl border border-border flex items-center justify-center shadow-sm mb-5">
            <Shield size={28} className="text-accent" />
          </div>
          <h1 className="text-3xl font-bold font-display text-foreground">Admin Portal</h1>
          <p className="text-muted-foreground mt-2">Sign in to manage your organizational elections.</p>
        </div>

        <Card className="p-6 sm:p-8 bg-white/95 backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input 
              label="Organization Email" 
              type="email" 
              placeholder="admin@company.com" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-white text-foreground border-input placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/10"
              required
            />
            <Input 
              label="Password" 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-white text-foreground border-input placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/10"
              required
            />
            <Button 
              type="submit" 
              className="w-full" 
              size="lg"
              isLoading={loginMutation.isPending}
            >
              Sign In to Dashboard
            </Button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-600">
            Don't have an organization account? <br/>
            <Link href="/company/register" className="text-sky-700 font-semibold hover:underline mt-1 inline-block">
              Register your organization
            </Link>
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
