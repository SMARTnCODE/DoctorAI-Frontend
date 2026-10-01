import HospitalApp from '@/components/hospital/hospital-app'
import { Toaster } from '@/components/ui/sonner'

export default function App() {
  return (
    <>
      <HospitalApp />
      <Toaster richColors position="top-right" closeButton />
    </>
  )
}
