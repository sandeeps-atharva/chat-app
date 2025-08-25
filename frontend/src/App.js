import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { Send, User, LogOut, MessageCircle } from "lucide-react";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
const socket = io(API_URL, {
  transports: ["websocket", "polling"],
  withCredentials: true,
});
function App() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const emojiPickerRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (token && userData) {
      setUser(JSON.parse(userData));
      fetchMessages(token);
    }
  }, []);

  useEffect(() => {
    if (user) {
      socket.emit("join_room", user);
      socket.on("receive_message", (message) => {
        setMessages((prev) => [...prev, message]);
      });
      return () => {
        socket.off("receive_message");
      };
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target)
      ) {
        setShowEmoji(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const endpoint = isLogin ? "/api/login" : "/api/register";
      const body = isLogin
        ? { username: formData.username, password: formData.password }
        : formData;

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (response.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setUser(data.user);
        fetchMessages(data.token);
        setFormData({ username: "", email: "", password: "" });
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = () => {
    if (newMessage.trim() && user) {
      const messageData = {
        user_id: user.id,
        username: user.username,
        message: newMessage.trim(),
      };
      socket.emit("send_message", messageData);
      setNewMessage("");
      setShowEmoji(false); // Close emoji picker after sending
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSendMessage();
  };

  const handleEmojiSelect = (emoji) => {
    setNewMessage((prev) => prev + emoji.native);
    // Don't close the picker after selecting an emoji
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setMessages([]);
    socket.disconnect();
  };

  const formatTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  if (!user) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <MessageCircle className="login-icon" />
            <h1 className="login-title">Chat App</h1>
            <p className="login-subtitle">
              {isLogin ? "Welcome back!" : "Create your account"}
            </p>
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="form-container">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                required
                className="form-input"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
              />
            </div>
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  required
                  className="form-input"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                className="form-input"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={`form-button ${loading ? "loading" : ""}`}
            >
              {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
            </button>
          </div>
          <div className="toggle-form">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="toggle-button"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="header-content">
          <div className="header-left">
            <MessageCircle className="header-icon" />
            <h1 className="header-title">Chat Room</h1>
          </div>
          <div className="header-right">
            <div className="user-info">
              <User className="user-icon" />
              <span className="username">{user.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="logout-button"
              title="Logout"
            >
              <LogOut className="logout-icon" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.map((message, index) => {
          const isOwnMessage = message.username === user.username;
          return (
            <div
              key={message.id || index}
              className={`message-wrapper ${
                isOwnMessage ? "own-message" : "other-message"
              }`}
            >
              <div
                className={`message ${
                  isOwnMessage ? "message-own" : "message-other"
                }`}
              >
                {!isOwnMessage && (
                  <div className="message-username">{message.username}</div>
                )}
                <div className="message-content">{message.message}</div>
                <div
                  className={`message-time ${
                    isOwnMessage ? "message-time-own" : "message-time-other"
                  }`}
                >
                  {formatTime(message.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="input-container">
        <div className="input-wrapper">
          <input
            type="text"
            placeholder="Type your message..."
            className="message-input"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="emoji-button"
          >
            😊
          </button>
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="send-button"
          >
            <Send className="send-icon" />
          </button>
        </div>

        {/* Emoji Picker Popup */}
        {showEmoji && (
          <div ref={emojiPickerRef} className="emoji-picker-container">
            <Picker
              data={data}
              onEmojiSelect={handleEmojiSelect}
              theme="light"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
