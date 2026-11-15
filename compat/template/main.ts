import { mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { Smoke, smokeProviders } from './smoke';

bootstrapApplication(Smoke, mergeApplicationConfig(appConfig, { providers: smokeProviders })).catch((err) =>
  console.error(err),
);
