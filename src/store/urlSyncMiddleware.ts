import type { Middleware } from '@reduxjs/toolkit';
import { selectCase } from './casesSlice';

/**
 * Middleware to sync selected case with URL query parameters
 * This ensures URL and Redux state stay in sync
 */
const urlSyncMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);

  // When case selection changes, update URL (only on relevant pages)
  if (selectCase.match(action)) {
    const relevantPaths = ['/graph', '/timeline', '/map'];
    const currentPath = window.location.pathname;
    
    if (relevantPaths.includes(currentPath)) {
      const caseId = action.payload;
      const url = new URL(window.location.href);
      
      if (caseId) {
        url.searchParams.set('case', caseId);
      } else {
        url.searchParams.delete('case');
      }
      
      // Use replaceState to avoid creating history entries for case changes
      window.history.replaceState({}, '', url);
    }
  }

  return result;
};

export default urlSyncMiddleware;

