import { useEffect } from "react"
import { Switch, Route, Router as WouterRouter } from "wouter"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { App as CapacitorApp } from "@capacitor/app"
import { Toaster } from "@/components/ui/toaster"
import { Navbar } from "@/components/layout"

// Pages
import Landing from "@/pages/landing"
import CompanyLogin from "@/pages/company-login"
import CompanyRegister from "@/pages/company-register"
import Dashboard from "@/pages/dashboard"
import ElectionDetail from "@/pages/election-detail"
import VoterLogin from "@/pages/voter-login"
import VoterProfile from "@/pages/voter-profile"
import VoterPassword from "@/pages/voter-password"
import Voting from "@/pages/voting"
import Results from "@/pages/results"
import NotFound from "@/pages/not-found"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function Router() {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col">
      <Navbar />
      <div className="flex-1 min-w-0 max-w-full overflow-x-hidden flex flex-col">
        <Switch>
          <Route path="/" component={Landing} />
          
          <Route path="/company/register" component={CompanyRegister} />
          <Route path="/company/login" component={CompanyLogin} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/election/:id" component={ElectionDetail} />
          
          <Route path="/voter/login" component={VoterLogin} />
          <Route path="/voter/profile" component={VoterProfile} />
          <Route path="/voter/password" component={VoterPassword} />
          <Route path="/vote" component={Voting} />
          <Route path="/results/:electionId" component={Results} />
          
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  )
}

function NativeBackButtonHandler() {
  useEffect(() => {
    const removeListener = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        window.history.back()
        return
      }

      CapacitorApp.exitApp()
    })

    return () => {
      removeListener.then((listener) => listener.remove())
    }
  }, [])

  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <NativeBackButtonHandler />
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App;
