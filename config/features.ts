interface FeatureMatrix {
  offlineSync: boolean;
  roleBasedInstalls: boolean;
  mediaUploadResume: boolean;
  
  // Future Phase capabilities (Architecturally decoupled)
  khizrWorkspace: boolean;
  pushNotifications: boolean;
}

const ENVIRONMENT = process.env.NEXT_PUBLIC_APP_ENV || 'production';

const STAGING_FLAGS: FeatureMatrix = {
  offlineSync: true,
  roleBasedInstalls: true,
  mediaUploadResume: true,
  khizrWorkspace: true, // Evaluated during sandbox stages
  pushNotifications: true
};

const PRODUCTION_FLAGS: FeatureMatrix = {
  offlineSync: true,
  roleBasedInstalls: true,
  mediaUploadResume: true,
  khizrWorkspace: false, // Strict exclusion from production pipelines
  pushNotifications: false
};

export const FEATURE_FLAGS: FeatureMatrix = 
  ENVIRONMENT === 'production' ? PRODUCTION_FLAGS : STAGING_FLAGS;
