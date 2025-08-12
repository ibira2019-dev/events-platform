import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/dashboard'
import { prisma } from '@/lib/prisma'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/admin/login')
  }

  const stats = await prisma.$transaction([
    prisma.event.count(),
    prisma.order.count({ where: { status: 'paid' } }),
    prisma.order.aggregate({
      where: { status: 'paid' },
      _sum: { totalAmount: true },
    }),
    prisma.order.count({
      where: {
        status: 'paid',
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ])

  const [eventsCount, ordersCount, revenue, monthlyOrders] = stats

  return (
    <AdminDashboard
      stats={{
        eventsCount,
        ordersCount,
        revenue: revenue._sum.totalAmount || 0,
        monthlyOrders,
      }}
    />
  )
}
