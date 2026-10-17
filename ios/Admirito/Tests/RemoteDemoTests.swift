import XCTest
@testable import Admirito
final class RemoteDemoTests: XCTestCase {
    func testNamedDemoAndDestination() {
        XCTAssertEqual(RemoteDemoRules.request("Admirito, demo Alsea en MacMini."), RemoteDemoRequest(id:"alsea",destination:"macmini"))
        XCTAssertEqual(RemoteDemoRules.request("demo ALSEA en el Mac Mini"), RemoteDemoRequest(id:"alsea",destination:"macmini"))
        XCTAssertEqual(RemoteDemoRules.request("Demo global en MacMini")?.id, "global")
        XCTAssertTrue(RemoteDemoRules.label(RemoteDemoRequest(id:"alsea",destination:"macmini")).contains("Firefox de MacMini"))
    }
    func testUnknownDestinationAndExtraActionsNeverFallThroughToExecution() {
        for text in ["demo alsea en ordenador desconocido", "demo alsea en macmini y borra todo", "demo desconocida en macmini", "demo alsea en macmini en otro mac"] {
            XCTAssertNil(RemoteDemoRules.request(text)); XCTAssertTrue(RemoteDemoRules.isRemoteDemo(text))
        }
        XCTAssertFalse(RemoteDemoRules.isRemoteDemo("tour alsea mexico"))
        XCTAssertNil(RemoteDemoRules.request("https://evil.example en macmini"))
    }
}
