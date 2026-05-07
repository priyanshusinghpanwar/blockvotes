import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Shield, Fingerprint, Lock, BarChart3, ChevronRight } from "lucide-react"
import { PageTransition } from "@/components/layout"
import { motion } from "framer-motion"

export default function Landing() {
  return (
    <PageTransition className="min-h-[calc(100vh-5rem)] flex flex-col">
      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative flex-1 flex items-center justify-center overflow-hidden py-20 lg:py-32">
          {/* Background Image & Overlay */}
          <div className="absolute inset-0 z-0">
            <img 
              src={`${import.meta.env.BASE_URL}images/banner.jpg`} 
              alt="BlockVotes Banner" 
              className="w-full h-full object-cover object-center opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/85 to-background"></div>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-8 border border-primary/20 backdrop-blur-sm"
            >
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
              </span>
              Next-Generation Civic Infrastructure
            </motion.div>
            
            <h1 className="text-5xl md:text-7xl font-bold font-display text-foreground tracking-tight mb-6 max-w-4xl mx-auto leading-[1.1]">
              The Future of <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Trusted Elections.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              BlockVotes brings cryptographic certainty to organizational voting. Immutable, transparent, and effortlessly simple.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/voter/login?mode=vote" className="w-full sm:w-auto">
                <Button size="lg" className="w-full text-base group">
                  Cast Your Vote
                  <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/voter/login?mode=profile" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full text-base bg-white/50 backdrop-blur-md">
                  Voter Login
                </Button>
              </Link>
              <Link href="/company/login" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full text-base bg-white/50 backdrop-blur-md">
                  Admin Portal
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-white relative z-10 border-t border-border/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">Engineered for Integrity</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Our platform uses advanced cryptographic principles to ensure every vote is counted exactly as cast, with zero possibility of tampering.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: <Lock className="h-8 w-8 text-primary" />,
                  title: "Immutable Ledger",
                  desc: "Once a vote is cast, it becomes mathematically impossible to alter. True blockchain-inspired immutability."
                },
                {
                  icon: <Fingerprint className="h-8 w-8 text-accent" />,
                  title: "One Voter, One Vote",
                  desc: "Strict cryptographic validation ensures that duplicate voting is systematically prevented."
                },
                {
                  icon: <BarChart3 className="h-8 w-8 text-primary" />,
                  title: "Real-time Transparency",
                  desc: "As soon as the election concludes, results are verifiable and immediately available to all participants."
                }
              ].map((feature, i) => (
                <div key={i} className="bg-background rounded-2xl p-8 border border-border/50 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300 group">
                  <div className="w-14 h-14 bg-primary/5 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold font-display mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PageTransition>
  )
}
