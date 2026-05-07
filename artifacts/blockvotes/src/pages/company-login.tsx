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
    <PageTransition className="min-h-[calc(100vh-5rem)] flex items-center justify-center relative py-12 px-4">
      {/* Background Image - blockchain network */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/blockchain.jpg`} 
          alt="Blockchain Network" 
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 mb-6">
            <Shield size={32} className="text-accent" />
          </div>
          <h1 className="text-3xl font-bold font-display">Admin Portal</h1>
          <p className="text-muted-foreground mt-2">Sign in to manage your organizational elections.</p>
        </div>

        <Card className="p-8 glass">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input 
              label="Organization Email" 
              type="email" 
              placeholder="admin@company.com" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <Input 
              label="Password" 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={e => setPassword(e.target.value)}
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

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an organization account? <br/>
            <Link href="/company/register" className="text-primary font-semibold hover:underline mt-1 inline-block">
              Register your organization
            </Link>
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
