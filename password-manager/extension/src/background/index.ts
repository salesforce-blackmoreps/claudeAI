import { registerMessageRouter } from "./message-router";
import { registerAutoLockAlarm } from "./vault-session";

registerMessageRouter();
registerAutoLockAlarm();
