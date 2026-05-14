import { Link, useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth"
import { apiFetch } from "@/lib/api"
import { LogOut } from "lucide-react"
import { motion } from "framer-motion"

export function Navbar() {
  const { company, voter, logoutCompany, logoutVoter } = useAuth()
  const [location, setLocation] = useLocation()

  const handleLogout = async () => {
    if (company) {
      try {
        await apiFetch('/api/company/logout', { method: 'POST' })
      } catch {
        // Clearing local auth state is still safe even if the server logout call fails.
      }
      logoutCompany()
    }
    if (voter) logoutVoter()
    setLocation("/")
  }

  const isAuthPage = location === '/company/login' || location === '/company/register' || location === '/voter/login' || location === '/'

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              alt="BlockVotes Logo"
              className="h-9 w-auto group-hover:scale-105 transition-transform"
            />
          </Link>

          <nav className="flex items-center gap-3">
            {company && !isAuthPage && (
              <>
                <div className="hidden md:flex items-center gap-3 px-3 py-2 bg-muted rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                  <span className="text-sm font-medium text-muted-foreground">Admin: <strong className="text-foreground">{company.name}</strong></span>
                </div>
                <Link href="/dashboard" className="text-sm font-semibold text-primary hover:text-accent transition-colors hidden md:block">
                  Dashboard
                </Link>
              </>
            )}
            {voter && !isAuthPage && (
              <Link href="/vote" className="text-sm font-semibold text-primary hover:text-accent transition-colors hidden md:block">
                Vote
              </Link>
            )}
            
            {(company || voter) ? (
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-destructive transition-colors ml-4"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/voter/login" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
                  Voter Portal
                </Link>
                <Link href="/company/login" className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 shadow-sm transition-colors">
                  Admin Login
                </Link>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}

export function PageTransition({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
