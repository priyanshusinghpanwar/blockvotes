import { useState } from "react"
import { Link, useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { useRegisterCompany } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Building2 } from "lucide-react"
import { PageTransition } from "@/components/layout"
import { useToast } from "@/hooks/use-toast"

export default function CompanyRegister() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [, setLocation] = useLocation()
  const { setCompany } = useAuth()
  const { toast } = useToast()

  const registerMutation = useRegisterCompany({
    mutation: {
      onSuccess: (data) => {
        if (data.status === "success" && data.data) {
          setCompany(data.data)
          toast({
            title: "Registration Successful",
            description: "Your organization has been setup.",
          })
          setLocation("/dashboard")
        } else {
          toast({
            variant: "destructive",
            title: "Registration Failed",
            description: data.message || "Could not register organization",
          })
        }
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: err.message || "Server communication error",
        })
      }
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password) return
    registerMutation.mutate({ data: { name, email, password } })
  }

  return (
    <PageTransition className="min-h-[calc(100vh-4rem)] flex items-center justify-center relative py-10 px-4 app-section overflow-hidden">
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
            <Building2 size={32} className="text-accent" />
          </div>
          <h1 className="text-3xl font-bold font-display text-foreground">Create Organization</h1>
          <p className="text-muted-foreground mt-2">Register to start managing secure elections.</p>
        </div>

        <Card className="p-6 sm:p-8 bg-white/95 backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input 
              label="Organization Name" 
              type="text" 
              placeholder="Acme Corp" 
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
            <Input 
              label="Work Email" 
              type="email" 
              placeholder="admin@company.com" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <Input 
              label="Secure Password" 
              type="password" 
              placeholder="Create a secure password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <Button 
              type="submit" 
              className="w-full mt-2" 
              size="lg"
              isLoading={registerMutation.isPending}
            >
              Create Account
            </Button>
          </form>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Already have an account? <br/>
            <Link href="/company/login" className="text-primary font-semibold hover:underline mt-1 inline-block">
              Sign in here
            </Link>
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
