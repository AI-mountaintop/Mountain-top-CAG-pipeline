-- Comments table: stores card comments and actions
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  trello_id TEXT UNIQUE NOT NULL,
  text TEXT,
  member_creator JSONB DEFAULT '{}'::jsonb, -- {id, username, fullName, avatarUrl}
  date TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL, -- 'commentCard', 'updateCard', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_card_id ON comments(card_id);
CREATE INDEX idx_comments_trello_id ON comments(trello_id);
CREATE INDEX idx_comments_date ON comments(date);

-- Trigger for updated_at
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE comments IS 'Stores Trello card comments and activity actions';
