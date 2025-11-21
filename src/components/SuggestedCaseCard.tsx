import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Button,
  Box,
} from '@mui/material';
import {
  Add as AddIcon,
  Psychology as AIIcon,
} from '@mui/icons-material';
import type { CaseSuggestion } from '../contexts/CaseContext';

interface SuggestedCaseCardProps {
  suggestion: CaseSuggestion;
  onAccept: (suggestion: CaseSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

const SuggestedCaseCard: React.FC<SuggestedCaseCardProps> = ({ suggestion, onAccept, onDismiss }) => {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <AIIcon color="primary" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
              {suggestion.name}
            </Typography>
            <Chip label="AI Suggested" size="small" color="primary" sx={{ mt: 0.5 }} />
          </Box>
          <Chip label={suggestion.priority} size="small" color="warning" />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {suggestion.description}
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Entities: {suggestion.entityIds.length}
          </Typography>
        </Box>

        <Box
          sx={{
            p: 1.5,
            bgcolor: 'action.hover',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            AI Reasoning:
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {suggestion.reasoning}
          </Typography>
        </Box>
      </CardContent>

      <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
        <Button size="small" onClick={() => onDismiss(suggestion.id)}>
          Dismiss
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => onAccept(suggestion)}
        >
          Create Case
        </Button>
      </CardActions>
    </Card>
  );
};

export default SuggestedCaseCard;

