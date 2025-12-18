-- Trello Intelligence - Database Schema
-- Denormalized schema optimized for analytical and AI-driven queries

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Boards table: stores Trello board metadata
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trello_board_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_boards_trello_id ON boards(trello_board_id);

-- Lists table: stores Trello lists
CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  trello_list_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  position DECIMAL NOT NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lists_board_id ON lists(board_id);
CREATE INDEX idx_lists_trello_id ON lists(trello_list_id);

-- Cards table: denormalized card data with all metadata
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  list_id UUID REFERENCES lists(id) ON DELETE SET NULL,
  trello_card_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  position DECIMAL NOT NULL,
  due_date TIMESTAMPTZ,
  due_complete BOOLEAN DEFAULT FALSE,
  is_closed BOOLEAN DEFAULT FALSE,
  
  -- Denormalized JSONB fields for flexible querying
  labels JSONB DEFAULT '[]'::jsonb, -- Array of {id, name, color}
  members JSONB DEFAULT '[]'::jsonb, -- Array of {id, username, fullName}
  checklists JSONB DEFAULT '[]'::jsonb, -- Array of checklist data
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of attachment metadata
  
  -- Status derived from list name or can be custom
  status TEXT,
  
  -- URL to card
  url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cards_board_id ON cards(board_id);
CREATE INDEX idx_cards_list_id ON cards(list_id);
CREATE INDEX idx_cards_trello_id ON cards(trello_card_id);
CREATE INDEX idx_cards_updated_at ON cards(updated_at); -- For time-based queries
CREATE INDEX idx_cards_due_date ON cards(due_date);
CREATE INDEX idx_cards_labels ON cards USING GIN(labels); -- For JSONB queries
CREATE INDEX idx_cards_members ON cards USING GIN(members); -- For JSONB queries

-- Webhooks table: tracks registered Trello webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  trello_webhook_id TEXT UNIQUE NOT NULL,
  callback_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_board_id ON webhooks(board_id);
CREATE INDEX idx_webhooks_trello_id ON webhooks(trello_webhook_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updated_at updates
CREATE TRIGGER update_boards_updated_at BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE boards IS 'Stores Trello board metadata and sync status';
COMMENT ON TABLE lists IS 'Stores Trello lists with position tracking';
COMMENT ON TABLE cards IS 'Denormalized card data optimized for analytical queries';
COMMENT ON TABLE webhooks IS 'Tracks registered Trello webhooks for each board';
COMMENT ON COLUMN cards.labels IS 'JSONB array of label objects with id, name, and color';
COMMENT ON COLUMN cards.members IS 'JSONB array of member objects with id, username, and fullName';
COMMENT ON COLUMN cards.updated_at IS 'Indexed for time-based delta queries (e.g., changes in last 10 minutes)';
