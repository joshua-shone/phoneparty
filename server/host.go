package server

import (
	"encoding/json"
	"fmt"
	"github.com/gorilla/websocket"
	"log"
	"net"
	"net/http"
	"sync"
)

var hosts = struct {
	m map[string]*Host
	sync.RWMutex
}{m: make(map[string]*Host)}

type Host struct {
	IP          string
	SendChannel chan []byte
}

// HostMessage(s) are received as JSON from hosts via their websockets
type HostMessage struct {
	// The ID of the player this message should be forwarded to
	PlayerID *uint64 `json:"playerId"`

	// A Session Description Protocol used in the process of making a WebRTC connection with a player
	SDP *string `json:"sdp"`

	// An Interactive Connectivity Establishment candidate used in the process of making a WebRTC connection with a player
	ICECandidate *string `json:"iceCandidate"`

	// Indicates to players whether the host for their IP is 'connected' or 'disconnected'
	HostState *string `json:"host"`
}

// Upgrades the HTTP connection to a websocket and relays messages between host(s) and players
// to allow them to connect over WebRTC.
func HandleHostWebsocket(multihost bool) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {

		ip, _, err := net.SplitHostPort(request.RemoteAddr)
		if err != nil {
			msg := fmt.Sprintf("Rejected host connection as its remote address '%s' could not be parsed into host/port parts: %s", request.RemoteAddr, err)
			log.Println(msg)
			http.Error(response, msg, http.StatusBadRequest)
			return
		}

		hosts.Lock()

		if multihost {
			if _, foundExistingHost := hosts.m[ip]; foundExistingHost {
				hosts.Unlock()
				msg := fmt.Sprintf("Rejected host connection '%s' because there's already a host connected on that address", ip)
				log.Println(msg)
				http.Error(response, msg, http.StatusConflict)
				return
			}
		} else {
			if len(hosts.m) > 0 {
				msg := fmt.Sprintf("Rejected host connection '%s' because there's already a host connected", request.RemoteAddr)
				log.Println(msg)
				http.Error(response, msg, http.StatusConflict)
				return
			}
		}

		host := Host{ip, make(chan []byte, 20)}
		hosts.m[ip] = &host

		hosts.Unlock()

		defer func() {
			hosts.Lock()
			delete(hosts.m, ip)
			close(host.SendChannel)
			hosts.Unlock()

			// Notify players that the host has disconnected
			players.RLock()
			for _, player := range players.m {
				if player.IP == ip {
					err := player.Websocket.WriteMessage(websocket.TextMessage, []byte(`{"host": "disconnected"}`))
					if err != nil {
						log.Printf("Could not notify player %d at '%s' that the host had disconnected: %s", player.ID, player.IP, err)
					}
				}
			}
			players.RUnlock()
		}()

		websocket_, err := websocketUpgrader.Upgrade(response, request, nil)
		if err != nil {
			msg := fmt.Sprintf("Unable to upgrade host HTTP connection at '%s' to websocket: %s", ip, err)
			log.Println(msg)
			http.Error(response, msg, http.StatusInternalServerError)
			return
		}
		log.Println("Host connected - Address:", ip)

		// Notify players that a host has connected
		players.RLock()
		for _, player := range players.m {
			if player.IP == ip || !multihost {
				err := player.Websocket.WriteMessage(websocket.TextMessage, []byte(`{"host": "connected"}`))
				if err != nil {
					log.Printf("Could not notify player %d at '%s' that a host had connected: %s", player.ID, player.IP, err)
				}
			}
		}
		players.RUnlock()

		// Relay messages from players to host
		go func() {
			for message := range host.SendChannel {
				err = websocket_.WriteMessage(websocket.TextMessage, message)
				if err != nil {
					log.Printf("Could not write to websocket while relaying from player to host at '%s': %s", host.IP, err)
					return
				}
			}
		}()

		// Relay messages from host to players
		for {
			_, message, err := websocket_.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway) {
					log.Printf("Host websocket at %s closed unexpectedly", host.IP)
				} else if websocket.IsCloseError(err, websocket.CloseGoingAway) {
					log.Printf("Host websocket at %s closed", host.IP)
				} else {
					log.Printf("Error reading from host websocket at %s: %s", host.IP, err)
				}
				return
			}

			hostMessage := HostMessage{}
			err = json.Unmarshal(message, &hostMessage)
			if err != nil {
				log.Printf("Error while decoding JSON from host at '%s': %s", host.IP, err)
				return
			}

			if hostMessage.PlayerID == nil {
				log.Printf("Message received from host at '%s' does not contain playerId: %s", host.IP, message)
				return
			}

			players.RLock()
			player, found := players.m[*hostMessage.PlayerID]
			players.RUnlock()
			if !found {
				log.Printf("Received message from host for player '%d' but the player could not be found.", *hostMessage.PlayerID)
				continue
			}

			if multihost && player.IP != host.IP {
				log.Printf("Host at '%s' attempted to send a message to player ID %d which is on a different IP ('%s')", host.IP, *hostMessage.PlayerID, player.IP)
				continue
			}

			hostMessage.PlayerID = nil // Don't send the player its own ID

			messageToPlayer, err := json.Marshal(hostMessage)
			if err != nil {
				log.Printf("Could not encode JSON to send to player: %s", err)
				return
			}
			err = player.Websocket.WriteMessage(websocket.TextMessage, messageToPlayer)
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway) {
					log.Println("Player", player.ID, "websocket closed unexpectedly")
				} else if websocket.IsCloseError(err, websocket.CloseGoingAway) {
					log.Println("Player", player.ID, "websocket closed")
				} else {
					log.Println("Error while attempting to write to player websocket: ", err)
				}
				players.Lock()
				delete(players.m, player.ID)
				players.Unlock()
				host.SendChannel <- []byte(fmt.Sprintf(`{"playerId": %d, "connectionState": "disconnected"}`, player.ID))
			}
		}
	})
}
