import type { Case } from '../types/case';
// import type { CreateCaseInput, UpdateCaseInput } from '../types/case';

/**
 * Backend API URL
 * In production (monolith): use relative /api path (same server)
 * In development: use http://localhost:3000/api (separate backend server)
 */
const API_BASE_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api');

/**
 * Whether to use backend API or mock data
 */
const USE_BACKEND_API = import.meta.env.VITE_USE_BACKEND_API !== 'false';

/**
 * Fetch all cases from backend
 */
export const fetchCases = async (): Promise<Case[]> => {
  if (!USE_BACKEND_API) {
    console.log('📊 Backend disabled for cases, using local state only');
    return [];
  }

  try {
    console.log('🔗 Fetching cases from backend API...');
    const response = await fetch(`${API_BASE_URL}/cases`);

    if (!response.ok) {
      throw new Error(`Backend API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✓ Fetched ${data.cases.length} cases from ${data.source}`);

    return data.cases;
  } catch (error) {
    console.error('Error fetching cases from backend API:', error);
    console.warn('⚠️ Make sure the backend server is running: cd backend && npm start');
    throw error;
  }
};

/**
 * Fetch a single case by ID
 */
export const fetchCaseById = async (caseId: string): Promise<Case | null> => {
  if (!USE_BACKEND_API) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/cases/${encodeURIComponent(caseId)}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Backend API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.case;
  } catch (error) {
    console.error('Error fetching case from backend API:', error);
    return null;
  }
};

/**
 * Create a new case in the database
 */
export const createCaseInDB = async (
  caseData: Case
): Promise<{ success: boolean; message: string }> => {
  if (!USE_BACKEND_API) {
    // In mock mode, just return success
    return {
      success: true,
      message: `Mock: Case ${caseData.caseNumber} created (backend disabled)`,
    };
  }

  try {
    console.log(`📝 Creating case in backend: ${caseData.caseNumber}`);
    const response = await fetch(`${API_BASE_URL}/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...caseData,
        // Convert Date objects to ISO strings
        createdDate:
          caseData.createdDate instanceof Date
            ? caseData.createdDate.toISOString()
            : caseData.createdDate,
        updatedDate:
          caseData.updatedDate instanceof Date
            ? caseData.updatedDate.toISOString()
            : caseData.updatedDate,
        targetDate:
          caseData.targetDate instanceof Date
            ? caseData.targetDate.toISOString()
            : caseData.targetDate,
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend API returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`✓ Case ${caseData.caseNumber} created successfully`);

    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    console.error('Error creating case in backend API:', error);
    return {
      success: false,
      message: `Failed to create case: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Update an existing case in the database
 */
export const updateCaseInDB = async (
  caseId: string,
  updates: Partial<Case>
): Promise<{ success: boolean; message: string }> => {
  if (!USE_BACKEND_API) {
    // In mock mode, just return success
    return {
      success: true,
      message: `Mock: Case ${caseId} updated (backend disabled)`,
    };
  }

  try {
    console.log(`📝 Updating case in backend: ${caseId}`);
    const response = await fetch(`${API_BASE_URL}/cases/${encodeURIComponent(caseId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...updates,
        // Convert Date objects to ISO strings
        createdDate:
          updates.createdDate instanceof Date
            ? updates.createdDate.toISOString()
            : updates.createdDate,
        updatedDate:
          updates.updatedDate instanceof Date
            ? updates.updatedDate.toISOString()
            : updates.updatedDate,
        targetDate:
          updates.targetDate instanceof Date
            ? updates.targetDate.toISOString()
            : updates.targetDate,
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend API returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`✓ Case ${caseId} updated successfully`);

    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    console.error('Error updating case in backend API:', error);
    return {
      success: false,
      message: `Failed to update case: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Delete a case from the database
 */
export const deleteCaseFromDB = async (
  caseId: string
): Promise<{ success: boolean; message: string }> => {
  if (!USE_BACKEND_API) {
    // In mock mode, just return success
    return {
      success: true,
      message: `Mock: Case ${caseId} deleted (backend disabled)`,
    };
  }

  try {
    console.log(`🗑️  Deleting case from backend: ${caseId}`);
    const response = await fetch(`${API_BASE_URL}/cases/${encodeURIComponent(caseId)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Backend API returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`✓ Case ${caseId} deleted successfully`);

    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    console.error('Error deleting case from backend API:', error);
    return {
      success: false,
      message: `Failed to delete case: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};
