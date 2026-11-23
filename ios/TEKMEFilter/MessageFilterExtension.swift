// TEKMĒ Message Filter extension (IdentityLookup).
// STATUS: written on Windows, NEVER COMPILED, INSTALLED OR TESTED ON A DEVICE.
//
// iOS asks the enabled filter about SMS/MMS from UNKNOWN senders only (never iMessage, never contacts).
// The extension may answer allow / junk / promotion / transaction. TEKMĒ answers only `.junk` or `.allow`,
// classifies entirely on-device, and never defers to a network service (no ILMessageFilterExtensionNetworkURL
// key exists in Info.plist, and `context.deferQueryRequestToNetwork` is never called).

import IdentityLookup

final class MessageFilterExtension: ILMessageFilterExtension {
    // Loaded once per extension process; a load failure means every message is allowed (fail open).
    private static let classifier: TekmeClassifier? = try? TekmeClassifier(bundle: Bundle(for: MessageFilterExtension.self))
}

extension MessageFilterExtension: ILMessageFilterQueryHandling {
    func handle(_ queryRequest: ILMessageFilterQueryRequest,
                context: ILMessageFilterExtensionContext,
                completion: @escaping (ILMessageFilterQueryResponse) -> Void) {
        let response = ILMessageFilterQueryResponse()
        response.action = Self.decide(body: queryRequest.messageBody)
        completion(response)
    }

    static func decide(body: String?) -> ILMessageFilterAction {
        guard let body, !body.isEmpty, let c = classifier else { return .allow }
        return c.classify(String(body.prefix(2000))).isJunk ? .junk : .allow
    }
}
