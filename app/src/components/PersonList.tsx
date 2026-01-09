import React from 'react';
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { People, Edit, Undo, ExpandMore, Check, Close } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';

export interface PersonListSuspect {
  id: string;
  name: string;
  alias: string | null;
  threatLevel: string;
  criminalHistory: string | null;
  isSuspect?: boolean;
  customTitle?: string | null;
  originalName?: string;
  city?: string;
  linkedCities?: string[];
  linkedDevices?: { deviceId: string; relationship: string; source: string }[];
  hasCustomTitle?: boolean;
  totalScore?: number;
}

interface PersonListProps<T extends PersonListSuspect = PersonListSuspect> {
  suspects: T[];
  cityFilter: string | null;
  searchMatchIds: Set<string>;
  selectedPersonIds: Set<string>;
  expanded: boolean;
  onToggleSection: () => void;
  editingEntityId: string | null;
  editingTitle: string;
  onEditingTitleChange: (value: string) => void;
  onSaveTitle: (id: string) => void;
  onCancelEdit: () => void;
  onStartEditTitle: (person: T, e: React.MouseEvent) => void;
  onResetTitle: (person: T, e: React.MouseEvent) => void;
  onCardClick: (id: string) => void;
  onCardDoubleClick: (person: T) => void;
  onToggleColocationEntity: (id: string) => void;
}

const PersonList = <T extends PersonListSuspect>({
  suspects,
  cityFilter,
  searchMatchIds,
  selectedPersonIds,
  expanded,
  onToggleSection,
  editingEntityId,
  editingTitle,
  onEditingTitleChange,
  onSaveTitle,
  onCancelEdit,
  onStartEditTitle,
  onResetTitle,
  onCardClick,
  onCardDoubleClick,
  onToggleColocationEntity,
}: PersonListProps<T>) => {
  const theme = useTheme();

  const personsOfInterest = (cityFilter
    ? suspects.filter((s) => s.isSuspect !== false && (s.linkedCities || []).includes(cityFilter))
    : suspects.filter((s) => s.isSuspect !== false)) as T[];

  const associates = (cityFilter
    ? suspects.filter((s) => s.isSuspect === false && (s.linkedCities || []).includes(cityFilter))
    : suspects.filter((s) => s.isSuspect === false)) as T[];

  const renderCard = (s: T, index: number, color: string, isAssociate = false) => {
    const isSearchMatch = searchMatchIds.has(s.id);
    const isEditing = editingEntityId === s.id;

    const handleClick = (e: React.MouseEvent) => {
      if (isEditing) return;
      const multi = e.shiftKey || e.metaKey || e.ctrlKey;
      if (multi) {
        e.stopPropagation();
        onToggleColocationEntity(s.id);
        return;
      }
      onCardClick(s.id);
    };

    return (
      <Card
        key={s.id}
        onClick={handleClick}
        onDoubleClick={() => !isEditing && onCardDoubleClick(s)}
        elevation={0}
        sx={{
          mb: 1.5,
          bgcolor:
            selectedPersonIds.has(s.id)
              ? `${color}08`
              : isSearchMatch
                ? 'rgba(34, 197, 94, 0.06)'
                : theme.palette.mode === 'dark'
                  ? 'rgba(255,255,255,0.02)'
                  : 'rgba(0,0,0,0.01)',
          border: 1,
          borderColor: selectedPersonIds.has(s.id)
            ? color
            : isSearchMatch
              ? '#22c55e'
              : 'border.main',
          borderRadius: isAssociate ? 1.5 : 2,
          borderLeftWidth: isSearchMatch ? 3 : 1,
          cursor: isEditing ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: isSearchMatch ? '#22c55e' : color,
            bgcolor: isSearchMatch ? 'rgba(34, 197, 94, 0.1)' : `${color}05`,
          },
        }}
      >
        <CardContent sx={{ p: isAssociate ? 1.5 : 2, '&:last-child': { pb: isAssociate ? 1.5 : 2 } }}>
          <Stack direction="row" alignItems="center" spacing={isAssociate ? 1.5 : 1.5}>
            <Avatar
              sx={{
                bgcolor: color,
                width: isAssociate ? 30 : 36,
                height: isAssociate ? 30 : 36,
                fontSize: isAssociate ? 11 : 13,
                fontWeight: 700,
              }}
            >
              {index + 1}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {isEditing ? (
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <TextField
                    size="small"
                    value={editingTitle}
                    onChange={(e) => onEditingTitleChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveTitle(s.id);
                      if (e.key === 'Escape') onCancelEdit();
                    }}
                    autoFocus
                    sx={{
                      flex: 1,
                      '& .MuiInputBase-input': { fontSize: '0.85rem', py: 0.5 },
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <IconButton
                    size="small"
                    onClick={() => onSaveTitle(s.id)}
                    sx={{ color: theme.palette.accent.green }}
                  >
                    <Check sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={onCancelEdit}
                    sx={{ color: 'text.secondary' }}
                  >
                    <Close sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              ) : (
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.primary',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.name}
                  </Typography>
                  {s.hasCustomTitle && (
                    <Chip
                      label="edited"
                      size="small"
                      sx={{
                        height: 16,
                        fontSize: '0.55rem',
                        bgcolor: `${theme.palette.accent.purple}15`,
                        color: theme.palette.accent.purple,
                        borderRadius: '4px',
                      }}
                    />
                  )}
                  <Tooltip title="Edit name">
                    <IconButton
                      size="small"
                      onClick={(e) => onStartEditTitle(s, e)}
                      sx={{
                        ml: 'auto',
                        opacity: 0.4,
                        '&:hover': { opacity: 1, color: theme.palette.accent.orange },
                      }}
                    >
                      <Edit sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  {s.hasCustomTitle && (
                    <Tooltip title="Reset to original name">
                      <IconButton
                        size="small"
                        onClick={(e) => onResetTitle(s, e)}
                        sx={{
                          opacity: 0.4,
                          '&:hover': { opacity: 1, color: theme.palette.accent.red },
                        }}
                      >
                        <Undo sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              )}
              {s.alias && !isEditing && (
                <Typography variant="caption" sx={{ color: theme.palette.accent.orange, fontSize: '0.7rem' }}>
                  "{s.alias}"
                </Typography>
              )}
            </Box>
            {s.totalScore && !isEditing && (
              <Chip
                label={s.totalScore.toFixed(1)}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  bgcolor:
                    s.totalScore > 1.5
                      ? `${theme.palette.accent.red}15`
                      : `${theme.palette.accent.orange}15`,
                  color: s.totalScore > 1.5 ? theme.palette.accent.red : theme.palette.accent.orange,
                }}
              />
            )}
          </Stack>

          <Divider sx={{ my: 1.5, borderColor: 'border.main', opacity: 0.5 }} />

          <Stack spacing={0.75}>
            {s.linkedDevices && s.linkedDevices.length > 0 && (
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                📱 {s.linkedDevices.length} device{s.linkedDevices.length !== 1 ? 's' : ''}
              </Typography>
            )}
            {s.linkedCities && s.linkedCities.length > 0 && (
              <Typography variant="caption" sx={{ color: theme.palette.accent.blue, fontSize: '0.7rem' }}>
                📍 {s.linkedCities.join(', ')}
              </Typography>
            )}
            {s.criminalHistory && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.4 }}>
                {s.criminalHistory}
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        onClick={onToggleSection}
        sx={{ cursor: 'pointer', userSelect: 'none', mb: expanded ? 1.5 : 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <People sx={{ fontSize: 16, color: theme.palette.accent.red }} />
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              letterSpacing: 1.5,
              fontSize: '0.65rem',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            Persons of Interest
          </Typography>
          <Chip
            label={personsOfInterest.length}
            size="small"
            sx={{
              height: 20,
              minWidth: 20,
              bgcolor: `${theme.palette.accent.red}15`,
              color: theme.palette.accent.red,
              fontSize: '0.7rem',
              fontWeight: 600,
              borderRadius: '10px',
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        </Stack>
        <ExpandMore
          sx={{
            fontSize: 18,
            color: 'text.secondary',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </Stack>

      <Collapse in={expanded}>
        {personsOfInterest.map((s, i) => renderCard(s, i, theme.palette.accent.red))}

        {associates.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  letterSpacing: 1.5,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Associates
              </Typography>
              <Chip
                label={associates.length}
                size="small"
                sx={{
                  height: 18,
                  minWidth: 18,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  color: 'text.secondary',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  borderRadius: '9px',
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            </Stack>

            {associates.slice(0, 20).map((s, i) => renderCard(s, i, '#6b7280', true))}
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default PersonList;

