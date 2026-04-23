import dynamic from 'next/dynamic'
const App = dynamic(() => import('@/../../AccountingOS.jsx'), { ssr: false })
export default function DashboardPage() {
  return <App />
}
