import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Building2, Fingerprint, Lock, BarChart3, ChevronRight, ShieldCheck } from "lucide-react"
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

            <div className="grid md:grid-cols-3 gap-4 mb-14">
              {[
                {
                  icon: <Fingerprint className="h-6 w-6" />,
                  title: "Cast Vote",
                  desc: "Enter election details and complete OTP verification.",
                  href: "/voter/login?mode=vote",
                  cta: "Vote Now",
                },
                {
                  icon: <Lock className="h-6 w-6" />,
                  title: "Voter Profile",
                  desc: "Update profile, photo, signature, and password before voting opens.",
                  href: "/voter/login?mode=profile",
                  cta: "Open Profile",
                },
                {
                  icon: <Building2 className="h-6 w-6" />,
                  title: "Admin Portal",
                  desc: "Create elections, add candidates, import voters, and view results.",
                  href: "/company/login",
                  cta: "Manage Elections",
                },
              ].map((item) => (
                <Link key={item.title} href={item.href} className="group">
                  <div className="h-full rounded-xl border border-border bg-white p-6 shadow-sm transition-colors hover:border-primary/30 hover:bg-slate-50">
                    <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {item.icon}
                    </div>
                    <h2 className="text-xl font-bold font-display mb-2">{item.title}</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-5">{item.desc}</p>
                    <span className="inline-flex items-center text-sm font-semibold text-primary">
                      {item.cta}
                      <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
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
                <div key={feature.title} className="rounded-xl bg-white/70 p-5 border border-border">
                  <div className="w-11 h-11 bg-primary/5 rounded-lg flex items-center justify-center mb-4">
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
