import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, createTransform } from 'redux-persist';
import storage from 'redux-persist/lib/storage'; // localStorage
import casesReducer from './casesSlice';
import urlSyncMiddleware from './urlSyncMiddleware';
import caseSyncMiddleware from './caseSyncMiddleware';

// Transform to handle Date objects
const dateTransform = createTransform(
  // Transform state coming from Redux on its way to being serialized
  (inboundState: any) => {
    return {
      ...inboundState,
      cases: inboundState.cases?.map((c: any) => ({
        ...c,
        createdDate: c.createdDate instanceof Date ? c.createdDate.toISOString() : c.createdDate,
        updatedDate: c.updatedDate instanceof Date ? c.updatedDate.toISOString() : c.updatedDate,
        targetDate: c.targetDate instanceof Date ? c.targetDate.toISOString() : c.targetDate,
      })),
    };
  },
  // Transform state coming from storage on its way back to Redux
  (outboundState: any) => {
    return {
      ...outboundState,
      cases: outboundState.cases?.map((c: any) => ({
        ...c,
        createdDate: c.createdDate ? new Date(c.createdDate) : new Date(),
        updatedDate: c.updatedDate ? new Date(c.updatedDate) : new Date(),
        targetDate: c.targetDate ? new Date(c.targetDate) : undefined,
      })),
    };
  },
  { whitelist: ['cases'] }
);

// Redux Persist configuration
const persistConfig = {
  key: 'crime-graph-root',
  version: 1,
  storage,
  whitelist: ['cases'], // Only persist cases state
  transforms: [dateTransform],
};

const rootReducer = combineReducers({
  cases: casesReducer,
});

const persistedReducer = persistReducer<ReturnType<typeof rootReducer>>(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Disable serializability check - we handle Date serialization with dateTransform
      serializableCheck: false,
    }).concat(urlSyncMiddleware, caseSyncMiddleware), // Add case sync middleware
  devTools: process.env.NODE_ENV !== 'production',
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

