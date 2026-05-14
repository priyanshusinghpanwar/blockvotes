import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Fingerprint, Lock, BarChart3, ShieldCheck } from "lucide-react"
import { PageTransition } from "@/components/layout"
import { motion } from "framer-motion"

export default function Landing() {
  return (
    <PageTransition className="min-h-[calc(100vh-4rem)] flex flex-col app-section">
      <main className="flex-1 flex flex-col">
        <section className="relative flex-1 py-12 md:py-16">
          <div className="absolute inset-x-0 top-0 h-56 bg-white/70 border-b border-border"></div>
          <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="mx-auto w-fit inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-primary font-semibold text-sm mb-6 border border-border shadow-sm"
            >
              <ShieldCheck size={16} />
              Secure voting workspace
            </motion.div>
            
            <h1 className="text-4xl md:text-6xl font-bold font-display text-foreground tracking-tight mb-5 max-w-4xl mx-auto leading-tight text-center">
              BlockVotes
            </h1>
            
            <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed text-center">
              A clean portal for voters and administrators to manage secure organizational elections.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14">
              <Link href="/voter/login?mode=vote" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:min-w-44">
                  Cast Your Vote
                </Button>
              </Link>
              <Link href="/company/login" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:min-w-44">
                  Admin Portal
                </Button>
              </Link>
            </div>

            <div className="grid md:grid-cols-3 gap-6 border-t border-border pt-8">
              {[
                {
                  icon: <Lock className="h-8 w-8 text-primary" />,
                  title: "Protected Access",
                  desc: "Voters sign in with election credentials and OTP verification."
                },
                {
                  icon: <Fingerprint className="h-8 w-8 text-accent" />,
                  title: "One Vote Per Voter",
                  desc: "The voting flow prevents duplicate submission for the same voter."
                },
                {
                  icon: <BarChart3 className="h-8 w-8 text-primary" />,
                  title: "Clear Results",
                  desc: "Admins and voters can review participation and result summaries."
                }
              ].map((feature, i) => (
                <div key={feature.title} className="px-2">
                  <div className="w-10 h-10 bg-white rounded-lg border border-border flex items-center justify-center mb-4 shadow-sm">
                    {feature.icon}
                  </div>
                  <h3 className="text-base font-bold font-display mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PageTransition>
  )
}
