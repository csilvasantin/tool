import XCTest
@testable import Admirito

final class WakeWordTests: XCTestCase {
    @MainActor func testWakeNameMustBeAnEntireWord() {
        XCTAssertTrue(WakeWord.containsWakeWord("¡Admirito!"))
        XCTAssertTrue(WakeWord.containsWakeWord("Hola, ADMIRITO."))
        XCTAssertFalse(WakeWord.containsWakeWord("AdmiritoPlus"))
        XCTAssertFalse(WakeWord.containsWakeWord("Lanza el tour Starbucks México"))
        XCTAssertFalse(WakeWord.containsWakeWord(""))
    }
}
