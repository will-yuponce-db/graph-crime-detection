import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { initializeCases, selectCase } from '../store/casesSlice';
import type { Case } from '../types/case';

/**
 * Component to initialize cases and sync URL with Redux state
 * This ensures URL query params are reflected in Redux on page load/navigation
 */
const CaseInitializer: React.FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const initialized = useAppSelector(state => state.cases.initialized);
  const selectedCaseId = useAppSelector(state => state.cases.selectedCaseId);
  const cases = useAppSelector(state => state.cases.cases);

  // Initialize cases on first load
  useEffect(() => {
    if (!initialized) {
      dispatch(initializeCases());
    }
  }, [initialized, dispatch]);

  // Sync URL param with Redux state
  useEffect(() => {
    const caseIdFromUrl = searchParams.get('case');
    
    // If there's a case in the URL, sync it to Redux
    if (caseIdFromUrl) {
      // Only update if it's different from current state
      if (caseIdFromUrl !== selectedCaseId) {
        const caseExists = cases.some((caseItem: Case) => caseItem.id === caseIdFromUrl);
        if (caseExists) {
          console.log('✅ Case selected from URL:', caseIdFromUrl);
          dispatch(selectCase(caseIdFromUrl));
        } else {
          console.warn('⚠️ Case not found in available cases:', caseIdFromUrl);
        }
      }
    }
    // Note: We don't clear the selection if there's no URL param
    // This allows users to select cases from the sidebar without URL navigation
  }, [searchParams, selectedCaseId, cases, dispatch]);

  return null; // This component doesn't render anything
};

export default CaseInitializer;

