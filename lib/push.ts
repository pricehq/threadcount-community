/* The notification sender's short name.
 *
 * The implementation lives in lib/staffpushserver.ts, beside the other staff-only server code and
 * named so that nobody imports it into a screen by accident; this is the name the rest of the
 * product and the manual use. One line, no logic: a second implementation is how two different
 * answers to "was that sent?" get written.
 */
export {
  notifyDecided, notifyKitCheck, notifyOnRound, notifyReady, notifyText, notifyWaiting,
  pushConfigured, pushSenders, type Kind, type Msg,
} from "./staffpushserver";
