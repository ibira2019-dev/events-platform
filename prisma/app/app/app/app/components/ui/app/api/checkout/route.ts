import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const checkoutSchema = z.object({
  eventId: z.string(),
  tickets: z.array(z.object({
    ticketId: z.string(),
    quantity: z.number().min(1),
  })),
  customerName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  promoCode: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { eventId, tickets, customerName, email, phone, promoCode } = checkoutSchema.parse(body)

    // Получаем событие и билеты
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { tickets: true },
    })

    if (!event) {
      return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 })
    }

    // Проверяем промокод
    let promoCodeData = null
    if (promoCode) {
      promoCodeData = await prisma.promoCode.findUnique({
        where: { code: promoCode },
      })

      if (!promoCodeData || !promoCodeData.isActive) {
        return NextResponse.json({ error: 'Промокод недействителен' }, { status: 400 })
      }
    }

    // Создаем заказ
    const order = await prisma.order.create({
      data: {
        eventId,
        customerName,
        email,
        phone,
        promoCodeId: promoCodeData?.id,
        totalAmount: 0, // будет пересчитано
        items: {
          create: tickets.map(({ ticketId, quantity }) => {
            const ticket = event.tickets.find(t => t.id === ticketId)
            return {
              ticketId,
              quantity,
              price: ticket?.price || 0,
            }
          }),
        },
      },
      include: {
        items: {
          include: {
            ticket: true,
          },
        },
      },
    })

    // Пересчитываем общую сумму
    let totalAmount = order.items.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    )

    // Применяем промокод
    if (promoCodeData) {
      if (promoCodeData.discountType === 'percent') {
        totalAmount = Math.round(totalAmount * (1 - promoCodeData.discountValue / 100))
      } else {
        totalAmount = Math.max(0, totalAmount - promoCodeData.discountValue)
      }
    }

    // Обновляем заказ
    await prisma.order.update({
      where: { id: order.id },
      data: { totalAmount },
    })

    // Создаем Stripe сессию
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'rub',
            product_data: {
              name: `Билеты на ${event.title}`,
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/events/${event.slug}`,
      customer_email: email,
      metadata: {
        orderId: order.id,
      },
    })

    // Обновляем заказ с ID сессии
    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    })

    return NextResponse.json({ sessionId: session.id })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    )
  }
}
