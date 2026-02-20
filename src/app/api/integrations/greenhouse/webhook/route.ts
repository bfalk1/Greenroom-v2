import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Greenhouse webhook events we care about
type GreenhouseEvent = 
  | 'application_updated'
  | 'candidate_hired'
  | 'candidate_rejected'
  | 'job_created'
  | 'job_updated';

interface GreenhouseWebhookPayload {
  action: GreenhouseEvent;
  payload: {
    application?: {
      id: number;
      candidate_id: number;
      job_id: number;
      status: string;
      current_stage?: { name: string };
    };
    candidate?: {
      id: number;
      first_name: string;
      last_name: string;
      emails: { value: string }[];
    };
    job?: {
      id: number;
      name: string;
      status: string;
    };
  };
}

// Verify Greenhouse webhook signature
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('signature');
    const rawBody = await request.text();

    // Find company by webhook secret (we'll match based on signature)
    // In production, you'd have a better way to identify the company
    const configs = await prisma.greenhouseConfig.findMany({
      where: { syncEnabled: true },
      include: { company: true },
    });

    let matchedConfig = null;
    for (const config of configs) {
      if (config.webhookSecret && signature) {
        if (verifySignature(rawBody, signature, config.webhookSecret)) {
          matchedConfig = config;
          break;
        }
      }
    }

    // For now, allow unsigned webhooks in development
    if (!matchedConfig && process.env.NODE_ENV === 'development') {
      matchedConfig = configs[0];
    }

    if (!matchedConfig) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const payload: GreenhouseWebhookPayload = JSON.parse(rawBody);
    
    // Log the webhook event
    await prisma.webhookLog.create({
      data: {
        companyId: matchedConfig.companyId,
        source: 'greenhouse',
        event: payload.action,
        payload: payload as any,
      },
    });

    // Handle different event types
    switch (payload.action) {
      case 'application_updated':
        await handleApplicationUpdated(matchedConfig.companyId, payload);
        break;
      
      case 'candidate_hired':
        await handleCandidateHired(matchedConfig.companyId, payload);
        break;
      
      case 'candidate_rejected':
        await handleCandidateRejected(matchedConfig.companyId, payload);
        break;
      
      case 'job_created':
      case 'job_updated':
        await handleJobUpdate(matchedConfig.companyId, payload);
        break;
      
      default:
        console.log(`Unhandled Greenhouse event: ${payload.action}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Greenhouse webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleApplicationUpdated(companyId: string, payload: GreenhouseWebhookPayload) {
  const app = payload.payload.application;
  if (!app) return;

  // Check if this candidate has a HireUp assessment
  const assessment = await prisma.assessment.findFirst({
    where: {
      companyId,
      externalCandidateId: app.candidate_id.toString(),
    },
  });

  if (assessment) {
    // Update the assessment with the new stage info
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        externalStatus: app.status,
        externalStage: app.current_stage?.name,
      },
    });
  }
}

async function handleCandidateHired(companyId: string, payload: GreenhouseWebhookPayload) {
  const candidate = payload.payload.candidate;
  if (!candidate) return;

  // Mark assessment as hired (for analytics)
  await prisma.assessment.updateMany({
    where: {
      companyId,
      externalCandidateId: candidate.id.toString(),
    },
    data: {
      outcome: 'hired',
    },
  });
}

async function handleCandidateRejected(companyId: string, payload: GreenhouseWebhookPayload) {
  const candidate = payload.payload.candidate;
  if (!candidate) return;

  // Mark assessment as rejected (for analytics)
  await prisma.assessment.updateMany({
    where: {
      companyId,
      externalCandidateId: candidate.id.toString(),
    },
    data: {
      outcome: 'rejected',
    },
  });
}

async function handleJobUpdate(companyId: string, payload: GreenhouseWebhookPayload) {
  const job = payload.payload.job;
  if (!job) return;

  // Sync job to our database for assessment linking
  await prisma.externalJob.upsert({
    where: {
      companyId_externalId_source: {
        companyId,
        externalId: job.id.toString(),
        source: 'greenhouse',
      },
    },
    update: {
      name: job.name,
      status: job.status,
    },
    create: {
      companyId,
      externalId: job.id.toString(),
      source: 'greenhouse',
      name: job.name,
      status: job.status,
    },
  });
}
