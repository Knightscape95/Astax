/**
 * SIP API Routes
 * 
 * Systematic Investment Plans management
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  createSIPPlan,
  getSIPPlans,
  executeSIPInstallment,
  getPaperPortfolio,
} from '@/lib/paper-trading';
import { getStockQuote } from '@/lib/indian-market-service';
import { sql } from '@/lib/db';
import type { CreateSIPPlanInput, SIPFrequency, Exchange } from '@/types/indian-market';

// ============================================================================
// GET - List SIP plans
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    if (!portfolioId) {
      return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });
    }

    // Verify ownership
    const portfolio = await getPaperPortfolio(portfolioId);
    if (!portfolio || portfolio.user_id !== session.user.email) {
      return NextResponse.json({ error: 'Portfolio not found or unauthorized' }, { status: 404 });
    }

    const sipPlans = await getSIPPlans(portfolioId);

    // Get current prices for each SIP
    const enrichedPlans = await Promise.all(
      sipPlans.map(async (sip) => {
        const quote = await getStockQuote(sip.symbol, sip.exchange);
        const currentValue = Number(sip.units_accumulated) * quote.last_price;
        const absoluteReturns = currentValue - Number(sip.total_invested);
        const percentageReturns = sip.total_invested > 0 
          ? (absoluteReturns / Number(sip.total_invested)) * 100 
          : 0;

        return {
          ...sip,
          current_nav: quote.last_price,
          live_current_value: currentValue,
          live_absolute_returns: absoluteReturns,
          live_percentage_returns: percentageReturns,
        };
      })
    );

    // Calculate SIP summary
    const summary = {
      totalSIPs: enrichedPlans.length,
      activeSIPs: enrichedPlans.filter(s => s.is_active).length,
      totalInvested: enrichedPlans.reduce((sum, s) => sum + Number(s.total_invested), 0),
      currentValue: enrichedPlans.reduce((sum, s) => sum + s.live_current_value, 0),
      totalReturns: enrichedPlans.reduce((sum, s) => sum + s.live_absolute_returns, 0),
      monthlyCommitment: enrichedPlans
        .filter(s => s.is_active && s.frequency === 'monthly')
        .reduce((sum, s) => sum + Number(s.amount), 0),
    };

    return NextResponse.json({
      sips: enrichedPlans,
      summary,
    });
  } catch (error) {
    console.error('Error fetching SIPs:', error);
    return NextResponse.json({ error: 'Failed to fetch SIP plans' }, { status: 500 });
  }
}

// ============================================================================
// POST - Create SIP or execute installment
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create': {
        const {
          portfolio_id,
          name,
          symbol,
          exchange,
          amount,
          frequency,
          start_date,
          end_date,
          step_up_percentage,
          step_up_frequency,
          model_id,
        } = body;

        if (!portfolio_id || !name || !symbol || !amount || !frequency || !start_date) {
          return NextResponse.json(
            { error: 'Missing required fields: portfolio_id, name, symbol, amount, frequency, start_date' },
            { status: 400 }
          );
        }

        // Verify portfolio ownership
        const portfolio = await getPaperPortfolio(portfolio_id);
        if (!portfolio || portfolio.user_id !== session.user.email) {
          return NextResponse.json({ error: 'Portfolio not found or unauthorized' }, { status: 404 });
        }

        const sipInput: CreateSIPPlanInput = {
          portfolio_id,
          model_id,
          name,
          symbol,
          exchange: exchange || 'NSE',
          amount,
          frequency: frequency as SIPFrequency,
          start_date: new Date(start_date),
          end_date: end_date ? new Date(end_date) : undefined,
          step_up_percentage,
          step_up_frequency,
        };

        const sip = await createSIPPlan(sipInput);

        return NextResponse.json({
          sip,
          message: `SIP created: ₹${amount} ${frequency} in ${symbol}`,
        }, { status: 201 });
      }

      case 'execute_installment': {
        const { sip_id } = body;

        if (!sip_id) {
          return NextResponse.json({ error: 'sip_id required' }, { status: 400 });
        }

        // Get SIP and verify ownership
        const sipResult = await sql`
          SELECT s.*, p.user_id 
          FROM sip_plans s 
          JOIN paper_portfolios p ON s.portfolio_id = p.id 
          WHERE s.id = ${sip_id}
        `;
        const sipData = sipResult.rows[0];

        if (!sipData || sipData.user_id !== session.user.email) {
          return NextResponse.json({ error: 'SIP not found or unauthorized' }, { status: 404 });
        }

        // Get current NAV/price
        const quote = await getStockQuote(sipData.symbol, sipData.exchange);
        
        const result = await executeSIPInstallment(sip_id, quote.last_price);

        return NextResponse.json({
          installment: result.installment,
          trade: result.trade,
          message: `SIP installment executed: ${result.installment.units_purchased.toFixed(4)} units at ₹${quote.last_price}`,
        });
      }

      case 'pause': {
        const { sip_id } = body;
        await sql`UPDATE sip_plans SET is_active = false WHERE id = ${sip_id}`;
        return NextResponse.json({ message: 'SIP paused successfully' });
      }

      case 'resume': {
        const { sip_id } = body;
        await sql`UPDATE sip_plans SET is_active = true WHERE id = ${sip_id}`;
        return NextResponse.json({ message: 'SIP resumed successfully' });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: create, execute_installment, pause, resume' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in SIP operation:', error);
    const message = error instanceof Error ? error.message : 'Operation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// DELETE - Cancel SIP
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sipId = searchParams.get('id');

    if (!sipId) {
      return NextResponse.json({ error: 'SIP ID required' }, { status: 400 });
    }

    // Verify ownership
    const sipResult = await sql`
      SELECT s.*, p.user_id 
      FROM sip_plans s 
      JOIN paper_portfolios p ON s.portfolio_id = p.id 
      WHERE s.id = ${sipId}
    `;

    if (!sipResult.rows[0] || sipResult.rows[0].user_id !== session.user.email) {
      return NextResponse.json({ error: 'SIP not found or unauthorized' }, { status: 404 });
    }

    // Soft delete - mark as inactive
    await sql`UPDATE sip_plans SET is_active = false, end_date = NOW() WHERE id = ${sipId}`;

    return NextResponse.json({ message: 'SIP cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling SIP:', error);
    return NextResponse.json({ error: 'Failed to cancel SIP' }, { status: 500 });
  }
}
