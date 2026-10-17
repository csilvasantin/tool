import XCTest
@testable import Admirito
@MainActor final class SuiteExpertTests: XCTestCase {
    func testNativeWebKitConnectsToPublishedExpertEngineAndReadsItsHelp() async throws {
        guard ProcessInfo.processInfo.environment["ADMIRITO_LIVE_TESTS"] == "1" else { throw XCTSkip("Explicit opt-in production read-only check") }
        let console = SuiteExpertConsole(); console.observe(); defer { console.stopObserving() }
        for _ in 0..<300 { if console.ready { break }; try await Task.sleep(for: .milliseconds(200)) }
        XCTAssertTrue(console.ready, console.status); guard console.ready else { return }
        console.send("/help")
        for _ in 0..<150 { if !console.busy { break }; try await Task.sleep(for: .milliseconds(200)) }
        XCTAssertFalse(console.busy); XCTAssertTrue(console.output.lowercased().contains("tour"), console.status)
    }
}
