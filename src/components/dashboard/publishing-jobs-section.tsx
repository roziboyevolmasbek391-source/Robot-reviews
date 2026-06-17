"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PublishJob {
  id: string;
  businessId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface PublishAttempt {
  id: string;
  provider: string;
  success: boolean;
  error: string | null;
}

export function PublishingJobsSection() {
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<PublishJob | null>(null);
  const [attempts, setAttempts] = useState<PublishAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchJobs() {
    try {
      const response = await fetch("/api/publish/jobs");
      const data = await response.json();
      setJobs(data);
    } catch (error) {
      console.error("Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  }

  async function selectJob(job: PublishJob) {
    setSelectedJob(job);
    try {
      const response = await fetch(`/api/publish?jobId=${job.id}`);
      const data = await response.json();
      setAttempts(data.attempts);
    } catch (error) {
      console.error("Failed to fetch job details");
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "bg-gray-100",
      RUNNING: "bg-blue-100",
      COMPLETED: "bg-green-100",
      FAILED: "bg-red-100",
      WAITING_FOR_VERIFICATION: "bg-yellow-100",
    };
    return colors[status] || "bg-gray-100";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Publishing Jobs</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className={`p-4 cursor-pointer ${
                selectedJob?.id === job.id ? "border-blue-500 border-2" : ""
              }`}
              onClick={() => selectJob(job)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Business {job.businessId.slice(0, 8)}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant={job.status === "COMPLETED" ? "default" : "secondary"}>
                  {job.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>

        {selectedJob && (
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Job Details</h3>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <Badge className="mt-1">{selectedJob.status}</Badge>
              </div>

              <div>
                <p className="text-sm text-gray-600">Started</p>
                <p>
                  {selectedJob.startedAt
                    ? new Date(selectedJob.startedAt).toLocaleString()
                    : "Not started"}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600">Provider Results</p>
                <div className="mt-2 space-y-2">
                  {attempts.map((attempt) => (
                    <div key={attempt.id} className="flex items-center justify-between text-sm">
                      <span>{attempt.provider}</span>
                      <Badge
                        variant={attempt.success ? "default" : "destructive"}
                      >
                        {attempt.success ? "Success" : "Failed"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
