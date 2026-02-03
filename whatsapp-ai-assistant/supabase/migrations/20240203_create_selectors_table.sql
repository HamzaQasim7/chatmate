-- Create the platform_selectors table
CREATE TABLE public.platform_selectors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'linkedin', 'slack')),
    selector_key TEXT NOT NULL,
    selector_value TEXT NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(platform, selector_key, version)
);

-- Enable Row Level Security
ALTER TABLE public.platform_selectors ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access to everyone (public/anon)
-- This ensures the extension can fetch selectors without user login if needed, or we can restrict to authenticated.
-- Ideally, for an extension, public read for config is fine.
CREATE POLICY "Allow public read access" ON public.platform_selectors
    FOR SELECT
    USING (true);

-- Create policy to allow write access only to service_role (admins) for now
-- Or if you have an admin user role, you can specify that.
CREATE POLICY "Allow admin write access" ON public.platform_selectors
    FOR ALL
    USING (auth.role() = 'service_role');

-- Insert initial default selectors (Current Hardcoded Values)

-- WhatsApp Defaults
INSERT INTO public.platform_selectors (platform, selector_key, selector_value, description) VALUES
('whatsapp', 'input_field', 'footer div[contenteditable="true"], div[contenteditable="true"][data-tab="10"]', 'Main chat input field'),
('whatsapp', 'message_container', 'div[role="row"]', 'Container for a single message row'),
('whatsapp', 'incoming_message_class', '.message-in', 'CSS class for incoming messages'),
('whatsapp', 'outgoing_message_class', '.message-out', 'CSS class for outgoing messages'),
('whatsapp', 'main_panel', '#main, [data-testid="conversation-panel-wrapper"]', 'Main chat panel wrapper');

-- LinkedIn Defaults
INSERT INTO public.platform_selectors (platform, selector_key, selector_value, description) VALUES
('linkedin', 'input_field', '.msg-form__contenteditable', 'Main chat input field'),
('linkedin', 'message_container', '.msg-s-message-list__event', 'Container for a message event'),
('linkedin', 'sender_name', '.msg-s-message-group__name', 'Sender name element');

-- Slack Defaults
INSERT INTO public.platform_selectors (platform, selector_key, selector_value, description) VALUES
('slack', 'input_field', '[data-qa="message_input"]', 'Main chat input field'),
('slack', 'message_container', '.c-virtual_list__item', 'Virtual list item container'),
('slack', 'message_body', '.c-message_kit__text', 'Message text content');
