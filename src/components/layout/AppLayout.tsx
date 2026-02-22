import { Outlet } from 'react-router-dom'

// AppLayout is now just a shell — each page owns its own layout/sidebar
export default function AppLayout() {
  return (
    <div className="h-screen overflow-hidden bg-background">
      <Outlet />
    </div>
  )
}