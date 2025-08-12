import { EventsList } from '@/components/events-list'
import { EventsFilters } from '@/components/events-filters'
import { Hero } from '@/components/hero'
import { prisma } from '@/lib/prisma'

export default async function HomePage({
  searchParams,
}: {
  searchParams: { city?: string; date?: string; tags?: string }
}) {
  const events = await prisma.event.findMany({
    where: {
      isActive: true,
      date: {
        gte: new Date(),
      },
      ...(searchParams.city && { city: searchParams.city }),
      ...(searchParams.date && {
        date: {
          gte: new Date(searchParams.date),
          lt: new Date(new Date(searchParams.date).getTime() + 24 * 60 * 60 * 1000),
        },
      }),
      ...(searchParams.tags && {
        tags: {
          hasSome: searchParams.tags.split(','),
        },
      }),
    },
    include: {
      tickets: true,
    },
    orderBy: {
      date: 'asc',
    },
  })

  return (
    <main className="min-h-screen">
      <Hero />
      <section className="container mx-auto px-4 py-16">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Предстоящие события
          </h2>
          <EventsFilters />
        </div>
        <EventsList events={events} />
      </section>
    </main>
  )
}
