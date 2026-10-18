// The hub tab bar and the Biblioteca card page were removed in stage 2.
// Navigation now lives in ./navigation.ts; these aliases keep old imports valid.
export {
  destinations as hubs,
  activeDestination as activeHub,
} from "./navigation";
