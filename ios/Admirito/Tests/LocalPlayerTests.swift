import XCTest
@testable import Admirito
final class LocalPlayerTests: XCTestCase {
    func testCommandsRequireThreeExplicitIdentifiersAndRejectURLsAndInjection() throws {
        XCTAssertEqual(try LocalPlayerRequest.parse("/player starbucks alsea-sbux-021 IoT_1"), LocalPlayerRequest(project:"starbucks",location:"alsea-sbux-021",device:"IoT_1"))
        XCTAssertNil(try LocalPlayerRequest.parse("/player"))
        XCTAssertNil(try LocalPlayerRequest.parse("/tour alsea"))
        for command in ["/player starbucks site", "/player starbucks site https://evil.example", "/player starbucks site x;alert(1)", "/player starbucks site device extra"] {
            XCTAssertThrowsError(try LocalPlayerRequest.parse(command))
        }
    }
    func testCatalogKeepsExactProjectMembershipAndIoTSourceAssociation() throws {
        let fixture = #"{"locations":[{"id":"alsea-sbux-021","name":"Fixture ES","iot":[{"idIoT":"IoT_1","name":"iPad","instance":"physical-ipad","player":"ipad-admin-mupi"}]},{"id":"mexico-starbucks","name":"Starbucks","surfaces":[{"screen":"foreign-screen"}]},{"id":"books","name":"Fixture EN","project_id":"books","surfaces":[{"idIoT":"Books_1","name":"Display","screen":"books-screen"}]}]}"#.data(using:.utf8)!
        let catalog = try PlayerLocation.catalog(fixture)
        XCTAssertEqual(catalog.count,2)
        let site = try XCTUnwrap(catalog.first { $0.id == "alsea-sbux-021" })
        XCTAssertEqual(site.projects,["starbucks"])
        XCTAssertEqual(site.devices.first?.id,"IoT_1")
        XCTAssertEqual(site.devices.first?.screen,"ipad-admin-mupi")
        XCTAssertEqual(catalog.first { $0.id == "books" }?.devices.first?.screen,"books-screen")
    }
    func testEmptyOrUnplayableAssignmentFailsInsteadOfShowingGlobalStock() throws {
        for value in [#"{"ok":true,"draft":{"items":[]}}"#, #"{"ok":false}"#, #"{"ok":true,"draft":{"items":[{"asset":"http://unsafe.example/a.mp4","assetType":"video"}]}}"#] {
            XCTAssertThrowsError(try LocalPlayerHTTP.playlist(Data(value.utf8)))
        }
        XCTAssertEqual(try LocalPlayerHTTP.playlist(Data(#"{"ok":true,"draft":{"name":"ES / EN","items":[{"asset":"https://example.com/a.mp4","assetType":"video"}]}}"#.utf8)),"ES / EN")
    }
}
