var capacitorCapacitorBiometric = (function (exports, core) {
    'use strict';

    exports.BiometryType = void 0;
    (function (BiometryType) {
        // Android, iOS
        BiometryType[BiometryType["NONE"] = 0] = "NONE";
        // iOS
        BiometryType[BiometryType["TOUCH_ID"] = 1] = "TOUCH_ID";
        // iOS
        BiometryType[BiometryType["FACE_ID"] = 2] = "FACE_ID";
        // Android
        BiometryType[BiometryType["FINGERPRINT"] = 3] = "FINGERPRINT";
        // Android
        BiometryType[BiometryType["FACE_AUTHENTICATION"] = 4] = "FACE_AUTHENTICATION";
        // Android
        BiometryType[BiometryType["IRIS_AUTHENTICATION"] = 5] = "IRIS_AUTHENTICATION";
        // Android
        BiometryType[BiometryType["MULTIPLE"] = 6] = "MULTIPLE";
        // Android - Device credentials (PIN, pattern, or password)
        BiometryType[BiometryType["DEVICE_CREDENTIAL"] = 7] = "DEVICE_CREDENTIAL";
    })(exports.BiometryType || (exports.BiometryType = {}));
    exports.AuthenticationStrength = void 0;
    (function (AuthenticationStrength) {
        /**
         * No authentication available, even if PIN is available but useFallback = false
         */
        AuthenticationStrength[AuthenticationStrength["NONE"] = 0] = "NONE";
        /**
         * Strong authentication: Face ID on iOS, fingerprints on devices that consider fingerprints strong (Android).
         * Note: PIN/pattern/password is NEVER considered STRONG, even when useFallback = true.
         */
        AuthenticationStrength[AuthenticationStrength["STRONG"] = 1] = "STRONG";
        /**
         * Weak authentication: Face authentication on Android devices that consider face weak,
         * or PIN/pattern/password if useFallback = true (PIN is always WEAK, never STRONG).
         */
        AuthenticationStrength[AuthenticationStrength["WEAK"] = 2] = "WEAK";
    })(exports.AuthenticationStrength || (exports.AuthenticationStrength = {}));
    exports.AccessControl = void 0;
    (function (AccessControl) {
        /**
         * No biometric protection. Credentials are accessible without authentication.
         * This is the default behavior for backward compatibility.
         */
        AccessControl[AccessControl["NONE"] = 0] = "NONE";
        /**
         * Biometric authentication required for credential access.
         * Credentials are invalidated if biometrics change (e.g., new fingerprint enrolled).
         * More secure but credentials are lost if user modifies their biometric enrollment.
         */
        AccessControl[AccessControl["BIOMETRY_CURRENT_SET"] = 1] = "BIOMETRY_CURRENT_SET";
        /**
         * Biometric authentication required for credential access.
         * Credentials survive new biometric enrollment (e.g., adding a new fingerprint).
         * More lenient — recommended for most apps.
         */
        AccessControl[AccessControl["BIOMETRY_ANY"] = 2] = "BIOMETRY_ANY";
    })(exports.AccessControl || (exports.AccessControl = {}));
    /**
     * Biometric authentication error codes.
     * These error codes are used in `isAvailable()`, `verifyIdentity()`, `getSecureCredentials()`,
     * and `getSecureData()` rejection payloads.
     *
     * Keep this in sync with BiometricAuthError in README.md
     * Update whenever `convertToPluginErrorCode` functions are modified
     */
    exports.BiometricAuthError = void 0;
    (function (BiometricAuthError) {
        /**
         * Unknown error occurred
         */
        BiometricAuthError[BiometricAuthError["UNKNOWN_ERROR"] = 0] = "UNKNOWN_ERROR";
        /**
         * Biometrics are unavailable (no hardware or hardware error)
         * Platform: Android, iOS
         */
        BiometricAuthError[BiometricAuthError["BIOMETRICS_UNAVAILABLE"] = 1] = "BIOMETRICS_UNAVAILABLE";
        /**
         * User has been locked out due to too many failed attempts
         * Platform: Android, iOS
         */
        BiometricAuthError[BiometricAuthError["USER_LOCKOUT"] = 2] = "USER_LOCKOUT";
        /**
         * No biometrics are enrolled on the device
         * Platform: Android, iOS
         */
        BiometricAuthError[BiometricAuthError["BIOMETRICS_NOT_ENROLLED"] = 3] = "BIOMETRICS_NOT_ENROLLED";
        /**
         * User is temporarily locked out (Android: 30 second lockout)
         * Platform: Android
         */
        BiometricAuthError[BiometricAuthError["USER_TEMPORARY_LOCKOUT"] = 4] = "USER_TEMPORARY_LOCKOUT";
        /**
         * Authentication failed (user did not authenticate successfully)
         * Platform: Android, iOS
         */
        BiometricAuthError[BiometricAuthError["AUTHENTICATION_FAILED"] = 10] = "AUTHENTICATION_FAILED";
        /**
         * App canceled the authentication (iOS only)
         * Platform: iOS
         */
        BiometricAuthError[BiometricAuthError["APP_CANCEL"] = 11] = "APP_CANCEL";
        /**
         * Invalid context (iOS only)
         * Platform: iOS
         */
        BiometricAuthError[BiometricAuthError["INVALID_CONTEXT"] = 12] = "INVALID_CONTEXT";
        /**
         * Authentication was not interactive (iOS only)
         * Platform: iOS
         */
        BiometricAuthError[BiometricAuthError["NOT_INTERACTIVE"] = 13] = "NOT_INTERACTIVE";
        /**
         * Passcode/PIN is not set on the device
         * Platform: Android, iOS
         */
        BiometricAuthError[BiometricAuthError["PASSCODE_NOT_SET"] = 14] = "PASSCODE_NOT_SET";
        /**
         * System canceled the authentication (e.g., due to screen lock)
         * Platform: Android, iOS
         */
        BiometricAuthError[BiometricAuthError["SYSTEM_CANCEL"] = 15] = "SYSTEM_CANCEL";
        /**
         * User canceled the authentication
         * Platform: Android, iOS
         */
        BiometricAuthError[BiometricAuthError["USER_CANCEL"] = 16] = "USER_CANCEL";
        /**
         * User chose to use fallback authentication method
         * Platform: Android, iOS
         */
        BiometricAuthError[BiometricAuthError["USER_FALLBACK"] = 17] = "USER_FALLBACK";
        /**
         * No biometric-protected credentials or data exist for the requested server or key.
         * Platform: Android, iOS (`getSecureCredentials()`, `getSecureData()`).
         *
         * Thrown when `getSecureCredentials()` or `getSecureData()` is called but nothing was stored
         * with `accessControl` BIOMETRY_CURRENT_SET or BIOMETRY_ANY — for example after deletion,
         * a fresh install, or items removed from the secure enclave after biometric enrollment changes.
         *
         * Rejection message differs by platform and method:
         * - `getSecureCredentials()`: Android `No protected credentials found`, iOS
         *   `No protected credentials found for server`
         * - `getSecureData()`: Android `No protected data found`, iOS
         *   `No protected data found for key`
         *
         * @since 8.4.0
         */
        BiometricAuthError[BiometricAuthError["NO_PROTECTED_CREDENTIALS_FOUND"] = 21] = "NO_PROTECTED_CREDENTIALS_FOUND";
    })(exports.BiometricAuthError || (exports.BiometricAuthError = {}));

    const NativeBiometric = core.registerPlugin('NativeBiometric', {
        web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.NativeBiometricWeb()),
    });

    class NativeBiometricWeb extends core.WebPlugin {
        constructor() {
            super();
            /**
             * In-memory credential storage for browser development/testing.
             * Credentials are stored temporarily and cleared on page refresh.
             * This is NOT secure storage and should only be used for development purposes.
             */
            this.credentialStore = new Map();
            this.dataStore = new Map();
        }
        isAvailable() {
            // Web platform: return a dummy implementation for development/testing
            // Using TOUCH_ID as a generic placeholder for simulated biometric authentication
            return Promise.resolve({
                isAvailable: true,
                authenticationStrength: exports.AuthenticationStrength.STRONG,
                biometryType: exports.BiometryType.TOUCH_ID,
                deviceIsSecure: true,
                strongBiometryIsAvailable: true,
            });
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async addListener(_eventName, _listener) {
            // Web platform: no-op, but return a valid handle
            return {
                remove: async () => {
                    // Nothing to remove on web
                },
            };
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        verifyIdentity(_options) {
            console.log('verifyIdentity (dummy implementation)');
            // Dummy implementation: always succeeds for browser testing
            return Promise.resolve();
        }
        getCredentials(_options) {
            console.log('getCredentials (dummy implementation)', { server: _options.server });
            const credentials = this.credentialStore.get(_options.server);
            if (!credentials) {
                throw new Error('No credentials found for the specified server');
            }
            return Promise.resolve(credentials);
        }
        getSecureCredentials(_options) {
            console.log('getSecureCredentials (dummy implementation)', { server: _options.server });
            const credentials = this.credentialStore.get(_options.server);
            if (!credentials) {
                throw new Error('No credentials found for the specified server');
            }
            return Promise.resolve(credentials);
        }
        setCredentials(_options) {
            console.log('setCredentials (dummy implementation)', { server: _options.server });
            // Dummy implementation: store in memory
            this.credentialStore.set(_options.server, {
                username: _options.username,
                password: _options.password,
            });
            return Promise.resolve();
        }
        deleteCredentials(_options) {
            console.log('deleteCredentials (dummy implementation)', { server: _options.server });
            // Dummy implementation: remove from in-memory store
            this.credentialStore.delete(_options.server);
            return Promise.resolve();
        }
        isCredentialsSaved(_options) {
            console.log('isCredentialsSaved (dummy implementation)', { server: _options.server });
            // Dummy implementation: check in-memory store
            return Promise.resolve({ isSaved: this.credentialStore.has(_options.server) });
        }
        setData(_options) {
            console.log('setData (dummy implementation)', { key: _options.key });
            this.dataStore.set(_options.key, _options.value);
            return Promise.resolve();
        }
        getData(_options) {
            console.log('getData (dummy implementation)', { key: _options.key });
            const value = this.dataStore.get(_options.key);
            if (value === undefined) {
                throw new Error('No data found for the specified key');
            }
            return Promise.resolve({ value });
        }
        getSecureData(_options) {
            console.log('getSecureData (dummy implementation)', { key: _options.key });
            const value = this.dataStore.get(_options.key);
            if (value === undefined) {
                throw new Error('No protected data found for the specified key');
            }
            return Promise.resolve({ value });
        }
        deleteData(_options) {
            console.log('deleteData (dummy implementation)', { key: _options.key });
            this.dataStore.delete(_options.key);
            return Promise.resolve();
        }
        isDataSaved(_options) {
            console.log('isDataSaved (dummy implementation)', { key: _options.key });
            return Promise.resolve({ isSaved: this.dataStore.has(_options.key) });
        }
        async getPluginVersion() {
            return { version: 'web' };
        }
    }

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        NativeBiometricWeb: NativeBiometricWeb
    });

    exports.NativeBiometric = NativeBiometric;

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
