// Parity tests for the Swift classifier against outputs produced by the Python reference implementation
// (ml/export/ios_model.py -> Tests/Fixtures/expected.json). STATUS: NEVER RUN — requires Xcode on a Mac.

import XCTest
@testable import TEKME

final class TekmeClassifierTests: XCTestCase {
    struct Fixture: Decodable { let text: String; let compact_text: String; let probability: Double; let junk: Bool }

    func testMatchesPythonReference() throws {
        let bundle = Bundle(for: Self.self)
        let classifier = try TekmeClassifier(bundle: bundle)
        let url = try XCTUnwrap(bundle.url(forResource: "expected", withExtension: "json"))
        let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
        XCTAssertFalse(fixtures.isEmpty)
        var textMismatches = 0
        for f in fixtures {
            let r = classifier.classify(f.text)
            if r.compactText != f.compact_text { textMismatches += 1; print("compact_text differs for: \(f.text)\n  py: \(f.compact_text)\n  sw: \(r.compactText)") }
            XCTAssertEqual(r.probability, f.probability, accuracy: 1e-4, "probability differs for: \(f.text)")
            XCTAssertEqual(r.isJunk, f.junk, "junk decision differs for: \(f.text)")
        }
        XCTAssertEqual(textMismatches, 0)
    }

    func testEmptyMessageIsAllowed() throws {
        let c = try TekmeClassifier(bundle: Bundle(for: Self.self))
        XCTAssertFalse(c.classify("").isJunk)
    }
}
