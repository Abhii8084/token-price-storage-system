import TokenNetworkForm from "@/components/token-network-form"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="container mx-auto max-w-2xl pt-12">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Token Network Submission</h1>
          <p className="text-slate-600 text-lg">Submit your token and network information to our backend API</p>
        </div>
        <TokenNetworkForm />
      </div>
    </main>
  )
}
