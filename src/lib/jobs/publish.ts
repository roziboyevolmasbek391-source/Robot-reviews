import { publishQueue, queueConfig } from "@/lib/queue";
import { db } from "@/lib/db";
import { getProviderAdapter } from "@/lib/providers/factory";
import { AutomationProvider, PublishJobStatus } from "@prisma/client";

export interface PublishJobData {
  jobId: string;
  businessId: string;
  userId: string;
}

publishQueue.process(async (job) => {
  const { jobId, businessId, userId } = job.data as PublishJobData;

  try {
    // Get business data
    const business = await db.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new Error("Business not found");
    }

    // Update job status
    await db.publishJob.update({
      where: { id: jobId },
      data: {
        status: PublishJobStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    const providers = [
      AutomationProvider.YANDEX_BUSINESS,
      AutomationProvider.GOOGLE_BUSINESS,
      AutomationProvider.TWOGIS,
    ];

    const results = [];

    for (const provider of providers) {
      try {
        // Get provider session
        const session = await db.providerSession.findUnique({
          where: {
            provider_userId: {
              provider,
              userId,
            },
          },
        });

        if (!session) {
          results.push({
            provider,
            success: false,
            error: "No session found",
          });
          continue;
        }

        // Validate session
        const adapter = getProviderAdapter(provider);
        const validation = await adapter.validateSession({
          accessToken: session.accessToken || undefined,
          refreshToken: session.refreshToken || undefined,
          tokenExpiresAt: session.tokenExpiresAt || undefined,
        });

        if (!validation.valid && !validation.needsReconnect) {
          // Try to refresh
          const refreshed = await adapter.refreshSession({
            accessToken: session.accessToken || undefined,
            refreshToken: session.refreshToken || undefined,
            tokenExpiresAt: session.tokenExpiresAt || undefined,
          });

          await db.providerSession.update({
            where: { id: session.id },
            data: {
              accessToken: refreshed.accessToken,
              tokenExpiresAt: refreshed.tokenExpiresAt,
            },
          });
        }

        // Publish business
        const result = await adapter.publishBusiness(
          {
            name: business.name,
            category: business.category,
            description: business.description || "",
            phone: business.phone || "",
            website: business.website || "",
            email: business.email || "",
            address: business.address || "",
          },
          {
            accessToken: session.accessToken || undefined,
            tokenExpiresAt: session.tokenExpiresAt || undefined,
          }
        );

        // Record attempt
        await db.publishAttempt.create({
          data: {
            jobId,
            provider,
            success: result.success,
            error: result.error,
          },
        });

        results.push(result);
      } catch (error) {
        results.push({
          provider,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update job status
    const allSuccess = results.every((r) => r.success);
    await db.publishJob.update({
      where: { id: jobId },
      data: {
        status: allSuccess ? PublishJobStatus.COMPLETED : PublishJobStatus.FAILED,
        completedAt: new Date(),
      },
    });

    return results;
  } catch (error) {
    // Update job status to failed
    await db.publishJob.update({
      where: { id: jobId },
      data: {
        status: PublishJobStatus.FAILED,
        completedAt: new Date(),
      },
    });

    throw error;
  }
});

export async function enqueuePublishJob(data: PublishJobData) {
  return publishQueue.add(data, queueConfig);
}
