interface FeatureMatrix {
  offlineSync: boolean;
  roleBasedInstalls: boolean;
  mediaUploadResume: boolean;

  // Future Phase capabilities (Architecturally decoupled)
  pushNotifications: boolean;
}

const ENVIRONMENT = process.env.NEXT_PUBLIC_APP_ENV || 'production';

const STAGING_FLAGS: FeatureMatrix = {
  offlineSync: true,
  roleBasedInstalls: true,
  mediaUploadResume: true,
  pushNotifications: true
};

const PRODUCTION_FLAGS: FeatureMatrix = {
  offlineSync: true,
  roleBasedInstalls: true,
  mediaUploadResume: true,
  pushNotifications: false
};

export const FEATURE_FLAGS: FeatureMatrix = 
  ENVIRONMENT === 'production' ? PRODUCTION_FLAGS : STAGING_FLAGS;
