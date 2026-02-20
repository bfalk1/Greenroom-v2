import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GreenhouseClient } from '@/lib/greenhouse';

// POST /api/integrations/greenhouse/sync - Trigger manual sync
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = authHeader.substring(7);
    
    const company = await prisma.company.findFirst({
      where: { apiKey },
      include: { greenhouseConfig: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    if (!company.greenhouseConfig) {
      return NextResponse.json({ 
        error: 'Greenhouse integration not configured' 
      }, { status: 400 });
    }

    const client = new GreenhouseClient({
      apiKey: company.greenhouseConfig.apiKey,
      onBehalfOf: company.greenhouseConfig.onBehalfOfId || undefined,
    });

    // Sync open jobs
    const jobs = await client.getJobs({ status: 'open', per_page: 100 });
    
    let jobsSynced = 0;
    for (const job of jobs) {
      await prisma.externalJob.upsert({
        where: {
          companyId_externalId_source: {
            companyId: company.id,
            externalId: job.id.toString(),
            source: 'greenhouse',
          },
        },
        update: {
          name: job.name,
          status: job.status,
          metadata: {
            departments: job.departments,
            offices: job.offices,
          },
        },
        create: {
          companyId: company.id,
          externalId: job.id.toString(),
          source: 'greenhouse',
          name: job.name,
          status: job.status,
          metadata: {
            departments: job.departments,
            offices: job.offices,
          },
        },
      });
      jobsSynced++;
    }

    // Update last sync time
    await prisma.greenhouseConfig.update({
      where: { companyId: company.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      jobsSynced,
      lastSyncAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Greenhouse sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
