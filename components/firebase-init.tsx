'use client';

import {useEffect} from 'react';
import {getFirebaseApp, initFirebaseAnalytics} from '@/lib/firebase/client';

export default function FirebaseInit() {
  useEffect(() => {
    getFirebaseApp();
    void initFirebaseAnalytics();
  }, []);

  return null;
}
