/**
 * Greenhouse ATS API Client
 * Handles authentication and API requests to Greenhouse Harvest API
 */

export interface GreenhouseConfig {
  apiKey: string;
  onBehalfOf?: string; // User ID for On-Behalf-Of header
}

export interface GreenhouseJob {
  id: number;
  name: string;
  status: 'open' | 'closed' | 'draft';
  departments: { id: number; name: string }[];
  offices: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
  opened_at: string | null;
  closed_at: string | null;
}

export interface GreenhouseCandidate {
  id: number;
  first_name: string;
  last_name: string;
  company: string | null;
  title: string | null;
  emails: { value: string; type: string }[];
  phone_numbers: { value: string; type: string }[];
  created_at: string;
  updated_at: string;
}

export interface GreenhouseApplication {
  id: number;
  candidate_id: number;
  job_id: number;
  status: string;
  current_stage: { id: number; name: string } | null;
  created_at: string;
  updated_at: string;
}

export class GreenhouseClient {
  private apiKey: string;
  private onBehalfOf?: string;
  private baseUrl = 'https://harvest.greenhouse.io/v1';

  constructor(config: GreenhouseConfig) {
    this.apiKey = config.apiKey;
    this.onBehalfOf = config.onBehalfOf;
  }

  private getAuthHeader(): string {
    // Greenhouse uses Basic Auth with API key as username, empty password
    const credentials = Buffer.from(`${this.apiKey}:`).toString('base64');
    return `Basic ${credentials}`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { headers?: Record<string, string> } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'application/json',
    };

    // Add On-Behalf-Of header if provided
    const onBehalfOf = options.headers?.['On-Behalf-Of'] || this.onBehalfOf;
    if (onBehalfOf) {
      headers['On-Behalf-Of'] = onBehalfOf;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Greenhouse API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Jobs
  async getJobs(params?: { status?: string; per_page?: number; page?: number }): Promise<GreenhouseJob[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString());
    if (params?.page) searchParams.set('page', params.page.toString());
    
    const query = searchParams.toString();
    return this.request<GreenhouseJob[]>(`/jobs${query ? `?${query}` : ''}`);
  }

  async getJob(jobId: number): Promise<GreenhouseJob> {
    return this.request<GreenhouseJob>(`/jobs/${jobId}`);
  }

  // Candidates
  async getCandidates(params?: { per_page?: number; page?: number; email?: string }): Promise<GreenhouseCandidate[]> {
    const searchParams = new URLSearchParams();
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString());
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.email) searchParams.set('email', params.email);
    
    const query = searchParams.toString();
    return this.request<GreenhouseCandidate[]>(`/candidates${query ? `?${query}` : ''}`);
  }

  async getCandidate(candidateId: number): Promise<GreenhouseCandidate> {
    return this.request<GreenhouseCandidate>(`/candidates/${candidateId}`);
  }

  async createCandidate(data: {
    first_name: string;
    last_name: string;
    company?: string;
    title?: string;
    emails?: { value: string; type: string }[];
    phone_numbers?: { value: string; type: string }[];
  }): Promise<GreenhouseCandidate> {
    return this.request<GreenhouseCandidate>('/candidates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Applications
  async getApplications(params?: { 
    per_page?: number; 
    page?: number; 
    job_id?: number;
    status?: string;
  }): Promise<GreenhouseApplication[]> {
    const searchParams = new URLSearchParams();
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString());
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.job_id) searchParams.set('job_id', params.job_id.toString());
    if (params?.status) searchParams.set('status', params.status);
    
    const query = searchParams.toString();
    return this.request<GreenhouseApplication[]>(`/applications${query ? `?${query}` : ''}`);
  }

  async createApplication(data: {
    candidate_id: number;
    job_id: number;
    source_id?: number;
    referrer?: { type: string; value: string };
    attachments?: { filename: string; type: string; content: string; content_type: string }[];
  }): Promise<GreenhouseApplication> {
    return this.request<GreenhouseApplication>('/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Scorecards - for HireUp assessment results
  async submitScorecard(applicationId: number, data: {
    overall_recommendation: 'definitely_not' | 'no' | 'yes' | 'strong_yes';
    attributes: { name: string; type: string; rating: string; notes?: string }[];
  }): Promise<void> {
    await this.request(`/applications/${applicationId}/scorecards`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Utility to check connection
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/jobs?per_page=1');
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton factory for use in API routes
let clientInstance: GreenhouseClient | null = null;

export function getGreenhouseClient(config?: GreenhouseConfig): GreenhouseClient {
  if (!clientInstance && config) {
    clientInstance = new GreenhouseClient(config);
  }
  if (!clientInstance) {
    throw new Error('Greenhouse client not initialized. Provide config on first call.');
  }
  return clientInstance;
}
